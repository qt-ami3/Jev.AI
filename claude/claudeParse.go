//	For API variables see: API.go

package main

import (
	"os"
	"fmt"
	"context"

	"github.com/anthropics/anthropic-sdk-go"
)


func main() {
	ctx := context.Background()

	if API_KEY == "" {
		fmt.Println("Error: ANTHROPIC_API_KEY environment variable not set")
		return
	}

	defer func() { // Ensure cleanup happens at the end.
		fmt.Println("\nCleaning up temporary files in ./bin...")
		if err := cleanupBinDirectory(); err != nil {
			fmt.Printf("Warning: error during cleanup: %v\n", err)
		} else {
			fmt.Println("Cleanup completed successfully!")
		}
	}()

	// 1. Connect to MySQL database
	fmt.Println("Connecting to MySQL database...")
	dsn := "aval:Lol123456789!@tcp(127.0.0.1:3306)/mysqlDB?charset=utf8mb4&parseTime=True&loc=Local"

	db, err := sql.Open("mysql", dsn)
	if err != nil {
		fmt.Printf("Error connecting to database: %v\n", err)
		return
	}
	defer db.Close()

	err = db.Ping() // Test the connection.
	if err != nil {
		fmt.Printf("Error pinging database: %v\n", err)
		return
	}
	fmt.Println("Successfully connected to database!")

	// 2. Get user input for client ID
	targetClientID, err := getUserInput()
	if err != nil {
		fmt.Printf("Error getting user input: %v\n", err)
		return
	}

	// 3. Query client(s) from database
	var clients []Client
	var query string
	var rows *sql.Rows
	
	if targetClientID == -1 {
		fmt.Println("Processing all clients...") // Process all clients.
		query = "SELECT id, firstName, LastName, location, income, shopingFor FROM MOCK_DATA"
		rows, err = db.Query(query)
	} else {
		fmt.Printf("Processing client ID: %d...\n", targetClientID) // Process specific client.
		query = "SELECT id, firstName, LastName, location, income, shopingFor FROM MOCK_DATA WHERE id = ?"
		rows, err = db.Query(query, targetClientID)
	}
	
	if err != nil {
		fmt.Printf("Error querying database: %v\n", err)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var client Client
		err := rows.Scan(&client.ID, &client.FirstName, &client.LastName, &client.Location, &client.Income, &client.ShopingFor)
		if err != nil {
			fmt.Printf("Error scanning row: %v\n", err)
			continue
		}
		clients = append(clients, client)
	}
	
	if len(clients) == 0 {
		if targetClientID != -1 {
			fmt.Printf("Error: Client with ID %d not found in database\n", targetClientID)
		} else {
			fmt.Println("Error: No clients found in database")
		}
		return
	}
	
	fmt.Printf("Loaded %d client(s) from database\n", len(clients))

	clientsJSON, err := json.MarshalIndent(clients, "", "  ") // Convert clients to JSON for sending to Claude.
	if err != nil {
		fmt.Printf("Error marshaling clients to JSON: %v\n", err)
		return
	}

	// 4. Read companies/products JSON file
	fmt.Println("Reading products JSON file...")
	companiesData, err := os.ReadFile("./JSONS/MOCK_DATA.json")
	if err != nil {
		fmt.Printf("Error reading products file: %v\n", err)
		return
	}

	var companies []Company
	err = json.Unmarshal(companiesData, &companies)
	if err != nil {
		fmt.Printf("Error parsing products JSON: %v\n", err)
		return
	}
	fmt.Printf("Loaded %d products\n", len(companies))

	// 5. Convert JSON files to plaintext in ./bin directory
	fmt.Println("Converting JSON files to plaintext...")
	
	clientsTxtPath, err := convertJSONToText(clientsJSON, "clients")
	if err != nil {
		fmt.Printf("Error converting clients to text: %v\n", err)
		return
	}
	fmt.Printf("Created: %s\n", clientsTxtPath)
	
	productsTxtPath, err := convertJSONToText(companiesData, "products")
	if err != nil {
		fmt.Printf("Error converting products to text: %v\n", err)
		return
	}
	fmt.Printf("Created: %s\n", productsTxtPath)

	// 6. Open the text files for upload
	clientsFile, err := os.Open(clientsTxtPath)
	if err != nil {
		fmt.Printf("Error opening clients text file: %v\n", err)
		return
	}
	defer clientsFile.Close()

	productsFile, err := os.Open(productsTxtPath)
	if err != nil {
		fmt.Printf("Error opening products text file: %v\n", err)
		return
	}
	defer productsFile.Close()

	// 7. Upload files to Claude
	fmt.Println("Uploading clients data to Claude...")
	clientsUpload, err := client.Beta.Files.Upload(ctx, anthropic.BetaFileUploadParams{
		File:  anthropic.File(clientsFile, "clients.txt", "text/plain"),
		Betas: []anthropic.AnthropicBeta{anthropic.AnthropicBetaFilesAPI2025_04_14},
	})
	if err != nil {
		fmt.Printf("Error uploading clients file: %v\n", err)
		return
	}

	fmt.Println("Uploading products data to Claude...")
	productsUpload, err := client.Beta.Files.Upload(ctx, anthropic.BetaFileUploadParams{
		File:  anthropic.File(productsFile, "products.txt", "text/plain"),
		Betas: []anthropic.AnthropicBeta{anthropic.AnthropicBetaFilesAPI2025_04_14},
	})
	if err != nil {
		fmt.Printf("Error uploading products file: %v\n", err)
		return
	}
	
	fmt.Println("\n[User prompt to Claude]:")
	fmt.Println(promptAPI)
	fmt.Println("\nSending request to Claude...")

	// 8. Send request to Claude
	message, err := client.Beta.Messages.New(ctx, anthropic.BetaMessageNewParams{
		MaxTokens: 16000,
		Messages: []anthropic.BetaMessageParam{
			anthropic.NewBetaUserMessage(
				anthropic.NewBetaTextBlock(promptAPI),
				anthropic.NewBetaDocumentBlock(anthropic.BetaFileDocumentSourceParam{
					FileID: clientsUpload.ID,
				}),
				anthropic.NewBetaDocumentBlock(anthropic.BetaFileDocumentSourceParam{
					FileID: productsUpload.ID,
				}),
			),
		},
		Model: modelNameAPI,
		Betas: []anthropic.AnthropicBeta{anthropic.AnthropicBetaFilesAPI2025_04_14},
	})

	if err != nil {
		fmt.Printf("Error creating message: %v\n", err)
		return
	}

	// 9. Extract response from Claude
	var responseText string
	for _, content := range message.Content {
		responseText += content.Text
	}

	fmt.Println("\n[Claude's Response]:")
	fmt.Println(responseText[:min(500, len(responseText))] + "...")

	// 10. Extract SQL from response (remove markdown code blocks if present)
	sqlContent := extractSQL(responseText)

	// 11. Save to output directory
	fmt.Println("\nSaving SQL file to output directory...")
	
	err = os.MkdirAll("./output", 0755) // Create output directory if it doesn't exist.
	if err != nil {
		fmt.Printf("Error creating output directory: %v\n", err)
		return
	}

	// 12. Write SQL file with appropriate naming
	var outputPath string
	if targetClientID == -1 {
		outputPath = "./output/all_clients_affordable_products.sql"
	} else {
		outputPath = fmt.Sprintf("./output/client_%d_affordable_products.sql", targetClientID)
	}
	
	err = os.WriteFile(outputPath, []byte(sqlContent), 0644)
	if err != nil {
		fmt.Printf("Error writing SQL file: %v\n", err)
		return
	}

	fmt.Printf("\n✓ Success! SQL file saved to: %s\n", outputPath)
	fmt.Printf("Processed %d client(s) and %d products\n", len(clients), len(companies))
}
