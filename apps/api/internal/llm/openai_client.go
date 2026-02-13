package llm

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/nagasawakenji/studytree-ai/apps/api/internal/observability/logger"
	"github.com/nagasawakenji/studytree-ai/apps/api/internal/observability/request_id"
	"github.com/nagasawakenji/studytree-ai/apps/api/internal/usecase"
)

const defaultOpenAIModel = "gpt-4.1-mini"

var (
	errMissingAPIKey = errors.New("missing openai api key")
)

// OpenAIClient generates import plans using OpenAI Chat Completions API.
type OpenAIClient struct {
	httpClient *http.Client
	apiKey     string
	model      string
	log        *logger.Logger
}

// NewOpenAIClient creates an OpenAI-backed import planner.
func NewOpenAIClient(httpClient *http.Client, apiKey, model string, log *logger.Logger) *OpenAIClient {
	if httpClient == nil {
		httpClient = http.DefaultClient
	}
	if strings.TrimSpace(model) == "" {
		model = defaultOpenAIModel
	}
	return &OpenAIClient{
		httpClient: httpClient,
		apiKey:     strings.TrimSpace(apiKey),
		model:      model,
		log:        log,
	}
}

// GenerateImportPlan calls OpenAI and parses the result JSON into ImportPlan.
func (c *OpenAIClient) GenerateImportPlan(ctx context.Context, req usecase.ImportRequest) (usecase.ImportPlan, error) {
	if c.apiKey == "" {
		return usecase.ImportPlan{}, errMissingAPIKey
	}

	payload := map[string]any{
		"model": c.model,
		"messages": []map[string]string{
			{
				"role":    "system",
				"content": "You output JSON only.",
			},
			{
				"role":    "user",
				"content": buildImportPrompt(req),
			},
		},
		"response_format": map[string]string{
			"type": "json_object",
		},
		"temperature": 0.2,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return usecase.ImportPlan{}, err
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.openai.com/v1/chat/completions", bytes.NewReader(body))
	if err != nil {
		return usecase.ImportPlan{}, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+c.apiKey)

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return usecase.ImportPlan{}, err
	}
	defer resp.Body.Close()

	rawResp, err := io.ReadAll(io.LimitReader(resp.Body, 4*1024*1024))
	if err != nil {
		return usecase.ImportPlan{}, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return usecase.ImportPlan{}, fmt.Errorf("openai status=%d body=%s", resp.StatusCode, truncate(rawResp, 1000))
	}

	var completion struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(rawResp, &completion); err != nil {
		return usecase.ImportPlan{}, fmt.Errorf("decode completion failed: %w", err)
	}
	if len(completion.Choices) == 0 {
		return usecase.ImportPlan{}, errors.New("openai returned no choices")
	}

	content := strings.TrimSpace(completion.Choices[0].Message.Content)
	var plan usecase.ImportPlan
	if err := json.Unmarshal([]byte(content), &plan); err != nil {
		if c.log != nil {
			c.log.Error("openai import response json parse failed", map[string]any{
				"request_id":   request_id.FromContext(ctx),
				"raw_response": truncate([]byte(content), 1000),
				"error":        err.Error(),
			})
		}
		return usecase.ImportPlan{}, fmt.Errorf("%w: %v", usecase.ErrImportInvalidJSONFromLLM, err)
	}

	return plan, nil
}

func truncate(v []byte, max int) string {
	if len(v) <= max {
		return string(v)
	}
	return string(v[:max])
}
