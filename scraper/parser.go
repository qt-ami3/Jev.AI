//go:build parser

package main

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/chromedp/chromedp"
)

const listingsDir = "listings"

func main() {
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

	if err := os.MkdirAll(listingsDir, 0755); err != nil {
		fmt.Printf("Error creating listings dir: %v\n", err)
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

	for i, jobURL := range urls {
		fmt.Printf("[%d/%d] %s\n", i+1, len(urls), jobURL)

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

		listingPath := fmt.Sprintf("%s/%d.txt", listingsDir, i+1)
		lf, err := os.Create(listingPath)
		if err != nil {
			fmt.Printf("  Error creating %s: %v\n", listingPath, err)
			continue
		}

		lw := bufio.NewWriter(lf)
		fmt.Fprintf(lw, "%s | %s\n\n", title, jobURL)
		if description != "" {
			fmt.Fprintf(lw, "%s\n", description)
		}
		lw.Flush()
		lf.Close()

		fmt.Printf("  Saved %s\n", listingPath)
	}

	fmt.Println("Compiling listings into parse.txt...")
	if err := compile(len(urls)); err != nil {
		fmt.Printf("Error compiling: %v\n", err)
		return
	}
	fmt.Println("Done. Written to parse.txt")
}

func compile(count int) error {
	outFile, err := os.Create("parse.txt")
	if err != nil {
		return err
	}
	defer outFile.Close()

	writer := bufio.NewWriter(outFile)
	defer writer.Flush()

	separator := strings.Repeat("-", 118)
	compiled := 0

	for i := 1; i <= count; i++ {
		data, err := os.ReadFile(fmt.Sprintf("%s/%d.txt", listingsDir, i))
		if err != nil {
			continue
		}
		writer.Write(data)
		fmt.Fprintf(writer, "\n%s\n\n", separator)
		compiled++
	}

	fmt.Printf("Compiled %d/%d listings\n", compiled, count)
	return nil
}
