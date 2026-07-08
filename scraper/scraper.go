//go:build scraper

//	deconstructed linkedin job search link:
//
//	https://www.linkedin.com/jobs/search/?alertAction=viewjobs&currentJobId=JOB_ID&distance=RADIUS_MILES&f_E=EXP_LEVEL_CODES&f_TPR=rSECONDS&f_WT=WORK_TYPE_CODES&geoId=GEO_ID&keywords=SEARCH_KEYWORDS&location=CITY%2C%20STATE%2C%20COUNTRY&origin=ORIGIN_CONTEXT&sortBy=SORT_METHOD&spellCorrectionEnabled=BOOL

package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/chromedp/chromedp"
	_ "github.com/go-sql-driver/mysql"
)

func lookupGeoID(location string) (string, error) {
	apiURL := "https://www.linkedin.com/jobs-guest/api/typeaheadHits?typeaheadType=GEO&geoTypes=POPULATED_PLACE,ADMIN_DIVISION_2,MARKET_AREA,COUNTRY_REGION&query=" + url.QueryEscape(location)
	req, err := http.NewRequest("GET", apiURL, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "application/json, text/javascript, */*; q=0.01")
	req.Header.Set("Accept-Language", "en-US,en;q=0.9")
	req.Header.Set("Referer", "https://www.linkedin.com/jobs/search/")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	var results []struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(body, &results); err != nil {
		return "", fmt.Errorf("geoId API returned non-JSON (status %d): %s", resp.StatusCode, string(body[:min(len(body), 200)]))
	}
	if len(results) == 0 {
		return "", fmt.Errorf("no geoId found for location: %q", location)
	}
	return results[0].ID, nil
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func dsn() string {
	v := os.Getenv("DB_DSN")
	if v == "" {
		fmt.Fprintln(os.Stderr, "DB_DSN not set, e.g. user:pass@tcp(127.0.0.1:3306)/linkedin_scraper?charset=utf8mb4&parseTime=True&loc=Local")
		os.Exit(1)
	}
	return v
}

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "usage: scraper <user_id>")
		os.Exit(1)
	}
	userID := os.Args[1]

	db, err := sql.Open("mysql", dsn())
	if err != nil {
		panic(err)
	}
	defer db.Close()

	var location, distance, fWT, fE, fTPR, alertAction, currentJobID, origin, sortBy string
	var spellCorrection bool
	err = db.QueryRow(`
		SELECT location, distance, f_WT, f_E, f_TPR,
		       alert_action, current_job_id, origin, sort_by,
		       spell_correction_enabled
		FROM job_prefs WHERE user_id = ?
	`, userID).Scan(&location, &distance, &fWT, &fE, &fTPR,
		&alertAction, &currentJobID, &origin, &sortBy, &spellCorrection)
	if err != nil {
		panic(fmt.Errorf("reading job_prefs: %w", err))
	}

	var keywords string
	err = db.QueryRow("SELECT keywords FROM job_prefs WHERE user_id = ?", userID).Scan(&keywords)
	if err != nil {
		panic(fmt.Errorf("reading keywords: %w", err))
	}

	geoID, err := lookupGeoID(location)
	if err != nil {
		panic(fmt.Errorf("geoId lookup failed: %w", err))
	}
	fmt.Printf("geoId for %q: %s\n", location, geoID)

	spellStr := "true"
	if !spellCorrection {
		spellStr = "false"
	}

	ordered := [][2]string{
		{"alertAction", alertAction},
		{"currentJobId", currentJobID},
		{"distance", distance},
		{"f_E", fE},
		{"f_TPR", fTPR},
		{"f_WT", fWT},
		{"geoId", geoID},
		{"keywords", keywords},
		{"location", location},
		{"origin", origin},
		{"sortBy", sortBy},
		{"spellCorrectionEnabled", spellStr},
	}
	var parts []string
	for _, kv := range ordered {
		parts = append(parts, kv[0]+"="+url.QueryEscape(kv[1]))
	}
	fullURL := "https://www.linkedin.com/jobs/search/?" + strings.Join(parts, "&")

	opts := append(chromedp.DefaultExecAllocatorOptions[:],
		chromedp.Flag("headless", true),
		chromedp.Flag("no-sandbox", true),
		chromedp.Flag("disable-blink-features", "AutomationControlled"),
		chromedp.Flag("disable-infobars", true),
		chromedp.UserAgent("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"),
	)

	allocCtx, cancel := chromedp.NewExecAllocator(context.Background(), opts...)
	defer cancel()

	ctx, cancel := chromedp.NewContext(allocCtx)
	defer cancel()

	ctx, cancel = context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	var rawLinks []string
	err = chromedp.Run(ctx,
		chromedp.Navigate(fullURL),
		chromedp.Sleep(3*time.Second),
		chromedp.Evaluate(`
			Array.from(document.querySelectorAll('a[href*="/jobs/view/"]'))
				.map(el => el.href)
		`, &rawLinks),
	)
	if err != nil {
		panic(err)
	}

	// Deduplicate by job path (strip query params)
	seen := make(map[string]bool)
	var lines []string
	for _, raw := range rawLinks {
		u, err := url.Parse(raw)
		if err != nil {
			continue
		}
		path := u.Scheme + "://" + u.Host + u.Path
		if !strings.Contains(path, "/jobs/view/") {
			continue
		}
		if !seen[path] {
			seen[path] = true
			lines = append(lines, path)
		}
	}

	if len(lines) == 0 {
		fmt.Println("No job links found")
		return
	}

	outFile := "output_" + userID + ".txt"
	err = os.WriteFile(outFile, []byte(strings.Join(lines, "\n")+"\n"), 0644)
	if err != nil {
		panic(err)
	}
	fmt.Printf("Wrote %d job links to %s\n", len(lines), outFile)
}
