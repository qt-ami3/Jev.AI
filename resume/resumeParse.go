//go:build !claude

package main

import (
	"fmt"
	"os"
	"strings"

	"github.com/ledongthuc/pdf"
	"gopkg.in/ini.v1"
)

func main() {
	cfg, err := ini.Load("resume.ini")
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to read resume.ini: %v\n", err)
		os.Exit(1)
	}

	filePath := cfg.Section("resume").Key("file").String()
	filePath = strings.Trim(filePath, `"`)

	text, err := extractPDFText(filePath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to extract PDF text from %q: %v\n", filePath, err)
		os.Exit(1)
	}

	err = os.WriteFile("resume.txt", []byte(text), 0644)
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to write resume.txt: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("wrote resume.txt")
}

func extractPDFText(path string) (string, error) {
	f, r, err := pdf.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()

	var buf strings.Builder
	for i := 1; i <= r.NumPage(); i++ {
		page := r.Page(i)
		if page.V.IsNull() {
			continue
		}
		text, err := page.GetPlainText(nil)
		if err != nil {
			return "", err
		}
		buf.WriteString(text)
	}
	return buf.String(), nil
}
