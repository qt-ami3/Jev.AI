//go:build claude

package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"os"

	"github.com/anthropics/anthropic-sdk-go"
	_ "github.com/go-sql-driver/mysql"
)

type Resume struct {
	Name      string      `json:"name"`
	Email     string      `json:"email"`
	Phone     string      `json:"phone"`
	LinkedIn  string      `json:"linkedin"`
	GitHub    string      `json:"github"`
	Education []Education `json:"education"`
	Projects  []Project   `json:"projects"`
	Skills    Skills      `json:"skills"`
}

type Education struct {
	School string `json:"school"`
	Degree string `json:"degree"`
	Date   string `json:"date"`
}

type Project struct {
	Name       string   `json:"name"`
	Dates      string   `json:"dates"`
	Highlights []string `json:"highlights"`
}

type Skills struct {
	Frontend []string `json:"frontend"`
	Backend  []string `json:"backend"`
	Soft     []string `json:"soft"`
}

func dbDSN() string {
	if v := os.Getenv("DB_DSN"); v != "" {
		return v
	}
	return "aval:Lol123456789!@tcp(127.0.0.1:3306)/linkedin_scraper?charset=utf8mb4&parseTime=True&loc=Local"
}

func main() {
	resumeText, err := os.ReadFile("resume.txt")
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to read resume.txt: %v\n", err)
		os.Exit(1)
	}

	if os.Getenv("ANTHROPIC_API_KEY") == "" {
		fmt.Fprintln(os.Stderr, "ANTHROPIC_API_KEY environment variable not set")
		os.Exit(1)
	}

	client := anthropic.NewClient()

	prompt := fmt.Sprintf(`Parse the following resume text and return ONLY a JSON object with this exact structure (no markdown, no explanation):
{
  "name": "string",
  "email": "string",
  "phone": "string",
  "linkedin": "string",
  "github": "string",
  "education": [{"school": "string", "degree": "string", "date": "string"}],
  "projects": [{"name": "string", "dates": "string", "highlights": ["string"]}],
  "skills": {"frontend": ["string"], "backend": ["string"], "soft": ["string"]}
}

Resume text:
%s`, string(resumeText))

	msg, err := client.Messages.New(context.Background(), anthropic.MessageNewParams{
		Model:     anthropic.ModelClaudeSonnet4_6,
		MaxTokens: 2048,
		Messages: []anthropic.MessageParam{
			anthropic.NewUserMessage(anthropic.NewTextBlock(prompt)),
		},
	})
	if err != nil {
		fmt.Fprintf(os.Stderr, "API error: %v\n", err)
		os.Exit(1)
	}

	if len(msg.Content) == 0 {
		fmt.Fprintln(os.Stderr, "empty response from API")
		os.Exit(1)
	}

	raw := msg.Content[0].Text

	// Pretty-print if valid JSON, otherwise store raw
	var output []byte
	var parsed Resume
	if err := json.Unmarshal([]byte(raw), &parsed); err == nil {
		output, _ = json.MarshalIndent(parsed, "", "  ")
	} else {
		output = []byte(raw)
	}

	db, err := sql.Open("mysql", dbDSN())
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to connect to database: %v\n", err)
		os.Exit(1)
	}
	defer db.Close()

	_, err = db.Exec("UPDATE resume SET parsed_data = ? WHERE id = 1", string(output))
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to write parsed resume to database: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("wrote parsed resume to database")
}
