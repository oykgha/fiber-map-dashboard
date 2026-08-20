package main

import (
	"context"
	"log"
	"net/http"
	"os"

	"oneseo/fiber-map-backend/internal/api"
	"oneseo/fiber-map-backend/internal/db"
)

func main() {
	ctx := context.Background()

	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		databaseURL = "postgres://fiber_admin:fiber_dev_local_only@localhost:5432/fiber_network"
	}

	pool, err := db.Connect(ctx, databaseURL)
	if err != nil {
		log.Fatalf("connect to database: %v", err)
	}
	defer pool.Close()
	log.Println("connected to database")

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	server := api.NewServer(pool)

	log.Printf("listening on :%s", port)
	if err := http.ListenAndServe(":"+port, server.Routes()); err != nil {
		log.Fatalf("server error: %v", err)
	}
}
