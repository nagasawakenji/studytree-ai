package logger

import (
	"encoding/json"
	"io"
	"time"
)

// Logger writes structured JSON logs.
type Logger struct {
	out io.Writer
}

// NewJSONLogger returns a logger that writes JSON logs to the provided writer.
func NewJSONLogger(out io.Writer) *Logger {
	return &Logger{out: out}
}

// Info logs an informational message.
func (l *Logger) Info(msg string, fields map[string]any) {
	l.log("info", msg, fields)
}

// Error logs an error message.
func (l *Logger) Error(msg string, fields map[string]any) {
	l.log("error", msg, fields)
}

func (l *Logger) log(level, msg string, fields map[string]any) {
	payload := map[string]any{
		"ts":    time.Now().UTC().Format(time.RFC3339Nano),
		"level": level,
		"msg":   msg,
	}
	for key, value := range fields {
		payload[key] = value
	}
	encoder := json.NewEncoder(l.out)
	_ = encoder.Encode(payload)
}
