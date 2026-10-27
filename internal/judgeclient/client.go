package judgeclient

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type TestCase struct {
	Input          string `json:"input"`
	ExpectedOutput string `json:"expected_output"`
}

type Request struct {
	Language           string     `json:"language"`
	SourceCode         string     `json:"source_code"`
	Tests              []TestCase `json:"tests"`
	TimeLimitMS        int        `json:"time_limit_ms"`
	MemoryLimitMB      int        `json:"memory_limit_mb"`
	CompareMode        string     `json:"compare_mode"`
	StopOnFirstFailure bool       `json:"stop_on_first_failure"`
}

type Response struct {
	Verdict       string `json:"verdict"`
	Passed        int    `json:"passed"`
	Total         int    `json:"total"`
	TimeMS        int    `json:"time_ms"`
	MemoryKB      int    `json:"memory_kb"`
	CompileOutput string `json:"compile_output,omitempty"`
}

type Client struct {
	baseURL    string
	apiToken   string
	httpClient *http.Client
}

func NewClient(baseURL, apiToken string) *Client {
	return &Client{
		baseURL:  strings.TrimRight(baseURL, "/"),
		apiToken: apiToken,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

func (c *Client) Judge(ctx context.Context, input Request) (*Response, error) {
	body, err := json.Marshal(input)
	if err != nil {
		return nil, fmt.Errorf("encode judge request: %w", err)
	}

	req, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		c.baseURL+"/v1/judge",
		bytes.NewReader(body),
	)
	if err != nil {
		return nil, fmt.Errorf("create judge request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")

	if c.apiToken != "" {
		req.Header.Set("Authorization", "Bearer "+c.apiToken)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("call judge service: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		message, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return nil, fmt.Errorf(
			"judge service returned HTTP %d: %s",
			resp.StatusCode,
			strings.TrimSpace(string(message)),
		)
	}

	var result Response
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode judge response: %w", err)
	}

	return &result, nil
}
