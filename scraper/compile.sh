#!/bin/bash
go build -tags scraper -o linkedinScraper . && go build -tags parser -o linkedinParser .
