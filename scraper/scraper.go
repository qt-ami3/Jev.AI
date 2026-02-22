//go:build scraper

//	deconstructed linkedin job search link:
//
//	https://www.linkedin.com/jobs/search/?alertAction=viewjobs&currentJobId=JOB_ID&distance=RADIUS_MILES&f_E=EXP_LEVEL_CODES&f_TPR=rSECONDS&f_WT=WORK_TYPE_CODES&geoId=GEO_ID&keywords=SEARCH_KEYWORDS&location=CITY%2C%20STATE%2C%20COUNTRY&origin=ORIGIN_CONTEXT&sortBy=SORT_METHOD&spellCorrectionEnabled=BOOL

package main

import (
	"io"
	"os"
	"fmt"
	"time"
	"context"
	"net/url"
	"strings"
	"net/http"
	"encoding/json"

	"gopkg.in/ini.v1"
	"github.com/chromedp/chromedp"
)

func lookupGeoID(location string) (string, error) {
	apiURL := "https://www.linkedin.com/jobs-guest/api/typeaheadHits?typeaheadType=GEO&geoTypes=POPULATED_PLACE,ADMIN_DIVISION_2,MARKET_AREA,COUNTRY_REGION&query=" + url.QueryEscape(location)
	resp, err := http.Get(apiURL)
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
		return "", err
	}
	if len(results) == 0 {
		return "", fmt.Errorf("no geoId found for location: %q", location)
	}
	return results[0].ID, nil
}

func main() {
	cfg, err := ini.Load("config.ini")
	if err != nil {
		panic(err)
	}

	kw := cfg.Section("keywords")

	location := kw.Key("location").String()
	geoID, err := lookupGeoID(location)
	if err != nil {
		panic(fmt.Errorf("geoId lookup failed: %w", err))
	}
	fmt.Printf("geoId for %q: %s\n", location, geoID)

	// Build URL in the same order as the template
	ordered := [][2]string{
		{"alertAction",            kw.Key("alertAction").String()},
		{"currentJobId",           kw.Key("currentJobId").String()},
		{"distance",               kw.Key("distance").String()},
		{"f_E",                    kw.Key("f_E").String()},
		{"f_TPR",                  kw.Key("f_TPR").String()},
		{"f_WT",                   kw.Key("f_WT").String()},
		{"geoId",                  geoID},
		{"keywords",               kw.Key("keywords").String()},
		{"location",               location},
		{"origin",                 kw.Key("origin").String()},
		{"sortBy",                 kw.Key("sortBy").String()},
		{"spellCorrectionEnabled", kw.Key("spellCorrectionEnabled").String()},
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

	// Deduplicate by job path (strip query params so tracking noise doesn't create duplicates)
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

	err = os.WriteFile("output.txt", []byte(strings.Join(lines, "\n")+"\n"), 0644)
	if err != nil {
		panic(err)
	}
	fmt.Printf("Wrote %d job links to output.txt\n", len(lines))
}
