package config

import "os"

const defaultPort = "8080"

// Config holds application configuration loaded from environment variables.
type Config struct {
	Port        string
	DatabaseURL string
}

// Load reads configuration from environment variables.
func Load() Config {
	port := os.Getenv("PORT")
	if port == "" {
		port = defaultPort
	}

	return Config{
		Port:        port,
		DatabaseURL: os.Getenv("DATABASE_URL"),
	}
}
