//go:build parser

package main

import (
	"bufio"
	"context"
	"database/sql"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/chromedp/chromedp"
	_ "github.com/go-sql-driver/mysql"
)

func dsn() string {
	if v := os.Getenv("DB_DSN"); v != "" {
		return v
	}
	return "aval:Lol123456789!@tcp(127.0.0.1:3306)/linkedin_scraper?charset=utf8mb4&parseTime=True&loc=Local"
}

func main() {
	db, err := sql.Open("mysql", dsn())
	if err != nil {
		fmt.Printf("Error connecting to database: %v\n", err)
		return
	}
	defer db.Close()

	file, err := os.Open("output.txt")
	if err != nil {
		fmt.Printf("Error opening output.txt: %v\n", err)
		return
	}
	defer file.Close()

	var urls []string
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line != "" {
			urls = append(urls, line)
		}
	}
	if err := scanner.Err(); err != nil {
		fmt.Printf("Error reading file: %v\n", err)
		return
	}

	opts := append(chromedp.DefaultExecAllocatorOptions[:],
		chromedp.Flag("headless", true),
		chromedp.Flag("no-sandbox", true),
		chromedp.Flag("disable-blink-features", "AutomationControlled"),
		chromedp.Flag("disable-infobars", true),
		chromedp.UserAgent("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"),
	)

	allocCtx, allocCancel := chromedp.NewExecAllocator(context.Background(), opts...)
	defer allocCancel()

	descJS := `
		(function() {
			var selectors = [
				'.jobs-description__content',
				'.jobs-description-content',
				'.jobs-description__content--condensed',
				'.description__text--rich',
				'.description__text',
				'.show-more-less-html__markup',
				'div[class*="description__text"]',
				'section.description'
			];
			for (var i = 0; i < selectors.length; i++) {
				var el = document.querySelector(selectors[i]);
				if (el && el.innerText.trim().length > 50) return el.innerText.trim();
			}
			var best = '', bestLen = 0;
			document.querySelectorAll('div, section, article').forEach(function(el) {
				var t = el.innerText ? el.innerText.trim() : '';
				if (t.length > bestLen && t.length > 200 && el.children.length < 20) {
					best = t; bestLen = t.length;
				}
			});
			return best;
		})()`

	// Load existing URLs so we only scrape new ones
	existingURLs := make(map[string]bool)
	rows, err := db.Query("SELECT url FROM jobs")
	if err != nil {
		fmt.Printf("Error reading existing jobs: %v\n", err)
		return
	}
	for rows.Next() {
		var u string
		if err := rows.Scan(&u); err == nil {
			existingURLs[u] = true
		}
	}
	rows.Close()

	var newURLs []string
	for _, u := range urls {
		if !existingURLs[u] {
			newURLs = append(newURLs, u)
		}
	}
	if len(newURLs) == 0 {
		fmt.Println("No new job URLs to scrape")
		return
	}
	fmt.Printf("Found %d new URLs (skipping %d existing)\n", len(newURLs), len(urls)-len(newURLs))

	for i, jobURL := range newURLs {
		fmt.Printf("[%d/%d] %s\n", i+1, len(newURLs), jobURL)

		ctx, ctxCancel := chromedp.NewContext(allocCtx)
		ctx, timeoutCancel := context.WithTimeout(ctx, 30*time.Second)

		var title, description string
		err := chromedp.Run(ctx,
			chromedp.Navigate(jobURL),
			chromedp.Sleep(3*time.Second),
			chromedp.Evaluate(`(function(){ var el = document.querySelector('h1'); return el ? el.innerText.trim() : ''; })()`, &title),
			chromedp.Evaluate(descJS, &description),
		)

		timeoutCancel()
		ctxCancel()

		if err != nil {
			fmt.Printf("  Error: %v\n", err)
			continue
		}

		if title == "" {
			title = "(no title)"
		}

		_, err = db.Exec(
			"INSERT INTO jobs (title, url, description) VALUES (?, ?, ?)",
			title, jobURL, description,
		)
		if err != nil {
			fmt.Printf("  Error inserting job: %v\n", err)
			continue
		}

		fmt.Printf("  Saved to database\n")
	}

	fmt.Println("Compiling listings into parse.txt...")
	if err := compile(db); err != nil {
		fmt.Printf("Error compiling: %v\n", err)
		return
	}
	fmt.Println("Done. Written to parse.txt")
}

func compile(db *sql.DB) error {
	rows, err := db.Query("SELECT title, url, description FROM jobs ORDER BY id")
	if err != nil {
		return err
	}
	defer rows.Close()

	outFile, err := os.Create("parse.txt")
	if err != nil {
		return err
	}
	defer outFile.Close()

	writer := bufio.NewWriter(outFile)
	defer writer.Flush()

	separator := strings.Repeat("-", 118)
	count := 0

	for rows.Next() {
		var title, jobURL, description string
		if err := rows.Scan(&title, &jobURL, &description); err != nil {
			continue
		}
		fmt.Fprintf(writer, "%s | %s\n\n", title, jobURL)
		if description != "" {
			fmt.Fprintf(writer, "%s\n", description)
		}
		fmt.Fprintf(writer, "\n%s\n\n", separator)
		count++
	}

	fmt.Printf("Compiled %d listings\n", count)
	return nil
}
