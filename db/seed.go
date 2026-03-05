//go:build seed

// Imports resume/resume.txt into the resume.parsed_data DB column.
// Run from project root: go run -tags seed db/seed.go

package main

import (
	"database/sql"
	"fmt"
	"os"

	_ "github.com/go-sql-driver/mysql"
)

func dbDSN() string {
	if v := os.Getenv("DB_DSN"); v != "" {
		return v
	}
	return "aval:Lol123456789!@tcp(127.0.0.1:3306)/linkedin_scraper?charset=utf8mb4&parseTime=True&loc=Local"
}

func main() {
	data, err := os.ReadFile("resume/resume.txt")
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to read resume/resume.txt: %v\n", err)
		os.Exit(1)
	}

	db, err := sql.Open("mysql", dbDSN())
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to connect to database: %v\n", err)
		os.Exit(1)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		fmt.Fprintf(os.Stderr, "database ping failed: %v\n", err)
		os.Exit(1)
	}

	_, err = db.Exec("UPDATE resume SET parsed_data = ? WHERE id = 1", string(data))
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to write to database: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("seeded resume.parsed_data from resume/resume.txt")
}
