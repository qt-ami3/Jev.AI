//go:build claude

package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"os"

	"github.com/anthropics/anthropic-sdk-go"
	"github.com/anthropics/anthropic-sdk-go/option"
	_ "github.com/go-sql-driver/mysql"
)

type Resume struct {
	Name       string       `json:"name"`
	Email      string       `json:"email"`
	Phone      string       `json:"phone"`
	LinkedIn   string       `json:"linkedin"`
	GitHub     string       `json:"github"`
	Education  []Education  `json:"education"`
	Experience []Experience `json:"experience"`
	Projects   []Project    `json:"projects"`
	Skills     Skills       `json:"skills"`
}

type Education struct {
	School string `json:"school"`
	Degree string `json:"degree"`
	Date   string `json:"date"`
}

type Experience struct {
	Company    string   `json:"company"`
	Title      string   `json:"title"`
	Dates      string   `json:"dates"`
	Highlights []string `json:"highlights"`
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
	v := os.Getenv("DB_DSN")
	if v == "" {
		fmt.Fprintln(os.Stderr, "DB_DSN not set, e.g. user:pass@tcp(127.0.0.1:3306)/linkedin_scraper?charset=utf8mb4&parseTime=True&loc=Local")
		os.Exit(1)
	}
	return v
}

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "usage: resumeParse_Claude <user_id>")
		os.Exit(1)
	}
	userID := os.Args[1]

	db, err := sql.Open("mysql", dbDSN())
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to connect to database: %v\n", err)
		os.Exit(1)
	}
	defer db.Close()

	// Prefer the user's own key; fall back to the server-wide env key
	var apiKey string
	err = db.QueryRow("SELECT claude_api_key FROM config WHERE user_id = ?", userID).Scan(&apiKey)
	if err != nil && err != sql.ErrNoRows {
		fmt.Fprintf(os.Stderr, "failed to read API key from database: %v\n", err)
		os.Exit(1)
	}
	if apiKey == "" {
		apiKey = os.Getenv("CLAUDE_API_KEY")
	}
	if apiKey == "" || apiKey == "REPLACE_ME" {
		fmt.Fprintln(os.Stderr, "no Claude API key: set config.claude_api_key for the user or CLAUDE_API_KEY in the environment")
		os.Exit(1)
	}

	resumeFile := "resume_" + userID + ".txt"
	resumeText, err := os.ReadFile(resumeFile)
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to read %s: %v\n", resumeFile, err)
		os.Exit(1)
	}

	client := anthropic.NewClient(option.WithAPIKey(apiKey))

	prompt := fmt.Sprintf(`Parse the following resume text and return ONLY a JSON object with this exact structure (no markdown, no explanation):
{
  "name": "string",
  "email": "string",
  "phone": "string",
  "linkedin": "string",
  "github": "string",
  "education": [{"school": "string", "degree": "string", "date": "string"}],
  "experience": [{"company": "string", "title": "string", "dates": "string", "highlights": ["string"]}],
  "projects": [{"name": "string", "dates": "string", "highlights": ["string"]}],
  "skills": {"frontend": ["string"], "backend": ["string"], "soft": ["string"]}
}

Resume text:
%s`, string(resumeText))

	msg, err := client.Messages.New(context.Background(), anthropic.MessageNewParams{
		Model:     "claude-sonnet-5",
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

	var output []byte
	var parsed Resume
	if err := json.Unmarshal([]byte(raw), &parsed); err == nil {
		output, _ = json.MarshalIndent(parsed, "", "  ")
	} else {
		output = []byte(raw)
	}

	_, err = db.Exec("UPDATE resume SET parsed_data = ? WHERE user_id = ?", string(output), userID)
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to write parsed resume to database: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("wrote parsed resume to database")
}
