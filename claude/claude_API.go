
package main

import (
	"github.com/anthropics/anthropic-sdk-go"
	"github.com/anthropics/anthropic-sdk-go/option"
)

// API_KEY can be set here or loaded from environment variables.
var API_KEY = ""

// contains the instructions for Claude.
var promptAPI = `

`

var client = anthropic.NewClient( // Initialize Claude client.
	option.WithAPIKey(API_KEY),
)

const modelNameAPI = "claude-sonnet-4-20250514" // 	Model in use.
