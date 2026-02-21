//go:build append

package main

import (
	"log"
	"os"
)

const separator = "----------------------------------------------------------------------------------------------------------------------\n\n"

func main() {
	resume, err := os.ReadFile("resume/resume.txt")
	if err != nil {
		log.Fatal(err)
	}

	jobs, err := os.ReadFile("parse.txt")
	if err != nil {
		log.Fatal(err)
	}

	combined := string(resume) + "\n" + separator + string(jobs)

	if err := os.WriteFile("parse.txt", []byte(combined), 0644); err != nil {
		log.Fatal(err)
	}
}
