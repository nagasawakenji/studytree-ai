package usecase

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

var (
	// ErrImportNotConfigured indicates import dependencies are missing.
	ErrImportNotConfigured = errors.New("import not configured")
	// ErrImportInvalidRequest indicates the API request is invalid.
	ErrImportInvalidRequest = errors.New("invalid import request")
	// ErrImportInvalidPlan indicates generated import JSON is invalid.
	ErrImportInvalidPlan = errors.New("invalid import plan")
	// ErrImportInvalidJSONFromLLM indicates the provider returned an invalid JSON payload.
	ErrImportInvalidJSONFromLLM = errors.New("invalid json from llm")
	// ErrImportProvider indicates an upstream LLM/provider error.
	ErrImportProvider = errors.New("import provider error")
)

// ImportRequest is the API input for ChatGPT import.
type ImportRequest struct {
	BookTitle  string
	SourceText string
	Options    ImportOptions
}

// ImportOptions controls generation behavior.
type ImportOptions struct {
	MaxDepth        int
	ProblemsPerLeaf int
	Language        string
}

// ImportPlan is the JSON plan returned from LLM.
type ImportPlan struct {
	Book      ImportPlanBook      `json:"book"`
	Nodes     []ImportPlanNode    `json:"nodes"`
	Summaries []ImportPlanSummary `json:"summaries"`
	Problems  []ImportPlanProblem `json:"problems"`
}

// ImportPlanBook is the planned book payload.
type ImportPlanBook struct {
	Title string `json:"title"`
}

// ImportPlanNode is a node row keyed by temporary ID.
type ImportPlanNode struct {
	TmpID       string  `json:"tmp_id"`
	ParentTmpID *string `json:"parent_tmp_id"`
	Title       string  `json:"title"`
	OrderIndex  int     `json:"order_index"`
}

// ImportPlanSummary is a summary row keyed by node temporary ID.
type ImportPlanSummary struct {
	NodeTmpID string          `json:"node_tmp_id"`
	SchemaVer int             `json:"schema_ver"`
	Content   json.RawMessage `json:"content"`
}

// ImportPlanProblem is a problem row keyed by node temporary ID.
type ImportPlanProblem struct {
	NodeTmpID string          `json:"node_tmp_id"`
	Kind      string          `json:"kind"`
	SchemaVer int             `json:"schema_ver"`
	Content   json.RawMessage `json:"content"`
}

// ImportResult is the import API response payload.
type ImportResult struct {
	BookID   int64
	Created  ImportCreated
	Filtered ImportFiltered
}

// ImportCreated tracks inserted row counts.
type ImportCreated struct {
	Books     int
	Nodes     int
	Problems  int
	Summaries int
}

// ImportFiltered tracks rows dropped during normalization.
type ImportFiltered struct {
	SummariesInvalid int
	ProblemsInvalid  int
}

// ImportPlanGenerator asks an LLM to generate an ImportPlan.
type ImportPlanGenerator interface {
	GenerateImportPlan(ctx context.Context, req ImportRequest) (ImportPlan, error)
}

// ImportRepository persists the generated plan.
type ImportRepository interface {
	SaveImportPlan(ctx context.Context, userID string, plan ImportPlan) (ImportResult, error)
}

// ImportUsecase handles ChatGPT import.
type ImportUsecase struct {
	repo    ImportRepository
	planner ImportPlanGenerator
}

// NewImportUsecase creates an ImportUsecase.
func NewImportUsecase(repo ImportRepository, planner ImportPlanGenerator) *ImportUsecase {
	return &ImportUsecase{
		repo:    repo,
		planner: planner,
	}
}

// ImportFromChatGPT generates and persists a plan in one flow.
func (u *ImportUsecase) ImportFromChatGPT(ctx context.Context, req ImportRequest) (ImportResult, error) {
	if u.repo == nil || u.planner == nil {
		return ImportResult{}, ErrImportNotConfigured
	}
	if strings.TrimSpace(req.BookTitle) == "" || strings.TrimSpace(req.SourceText) == "" {
		return ImportResult{}, ErrImportInvalidRequest
	}
	if req.Options.MaxDepth <= 0 {
		req.Options.MaxDepth = 3
	}
	if req.Options.ProblemsPerLeaf <= 0 {
		req.Options.ProblemsPerLeaf = 3
	}
	if strings.TrimSpace(req.Options.Language) == "" {
		req.Options.Language = "ja"
	}

	plan, err := u.planner.GenerateImportPlan(ctx, req)
	if err != nil {
		if errors.Is(err, ErrImportInvalidJSONFromLLM) {
			return ImportResult{}, err
		}
		return ImportResult{}, fmt.Errorf("%w: %v", ErrImportProvider, err)
	}

	if strings.TrimSpace(plan.Book.Title) == "" {
		plan.Book.Title = strings.TrimSpace(req.BookTitle)
	}

	filteredCounts, err := validateAndNormalizeImportPlan(&plan)
	if err != nil {
		return ImportResult{}, fmt.Errorf("%w: %v", ErrImportInvalidPlan, err)
	}

	result, err := u.repo.SaveImportPlan(ctx, localUserID, plan)
	if err != nil {
		return ImportResult{}, err
	}
	result.Filtered = filteredCounts
	return result, nil
}

func validateAndNormalizeImportPlan(plan *ImportPlan) (ImportFiltered, error) {
	filtered := ImportFiltered{}
	if plan == nil {
		return filtered, errors.New("empty plan")
	}
	if strings.TrimSpace(plan.Book.Title) == "" {
		return filtered, errors.New("book.title is required")
	}
	if len(plan.Nodes) == 0 {
		return filtered, errors.New("nodes is required")
	}

	nodeByTmp := make(map[string]ImportPlanNode, len(plan.Nodes))
	for i := range plan.Nodes {
		node := &plan.Nodes[i]
		node.TmpID = strings.TrimSpace(node.TmpID)
		node.Title = strings.TrimSpace(node.Title)
		if node.ParentTmpID != nil {
			trimmedParent := strings.TrimSpace(*node.ParentTmpID)
			node.ParentTmpID = &trimmedParent
		}

		if strings.TrimSpace(node.TmpID) == "" {
			return filtered, errors.New("node.tmp_id is required")
		}
		if strings.TrimSpace(node.Title) == "" {
			return filtered, fmt.Errorf("node.title is required: %s", node.TmpID)
		}
		if node.ParentTmpID != nil && strings.TrimSpace(*node.ParentTmpID) == node.TmpID {
			return filtered, fmt.Errorf("node parent cannot be self: %s", node.TmpID)
		}
		if _, exists := nodeByTmp[node.TmpID]; exists {
			return filtered, fmt.Errorf("duplicate node.tmp_id: %s", node.TmpID)
		}
		nodeByTmp[node.TmpID] = *node
	}

	for _, node := range plan.Nodes {
		if node.ParentTmpID == nil {
			continue
		}
		parent := strings.TrimSpace(*node.ParentTmpID)
		if parent == "" {
			return filtered, fmt.Errorf("parent_tmp_id is empty: %s", node.TmpID)
		}
		if _, ok := nodeByTmp[parent]; !ok {
			return filtered, fmt.Errorf("unknown parent_tmp_id: %s", parent)
		}
	}

	visitState := make(map[string]int, len(plan.Nodes))
	var visit func(id string) error
	visit = func(id string) error {
		if visitState[id] == 1 {
			return fmt.Errorf("cycle detected at node: %s", id)
		}
		if visitState[id] == 2 {
			return nil
		}
		visitState[id] = 1
		node := nodeByTmp[id]
		if node.ParentTmpID != nil {
			if err := visit(strings.TrimSpace(*node.ParentTmpID)); err != nil {
				return err
			}
		}
		visitState[id] = 2
		return nil
	}
	for _, node := range plan.Nodes {
		if err := visit(node.TmpID); err != nil {
			return filtered, err
		}
	}

	filteredSummaries := make([]ImportPlanSummary, 0, len(plan.Summaries))
	for _, summary := range plan.Summaries {
		summary.NodeTmpID = strings.TrimSpace(summary.NodeTmpID)
		if _, ok := nodeByTmp[summary.NodeTmpID]; !ok {
			return filtered, fmt.Errorf("unknown summaries.node_tmp_id: %s", summary.NodeTmpID)
		}
		if hasValidSummaryContent(summary.Content) {
			if summary.SchemaVer <= 0 {
				summary.SchemaVer = 1
			}
			filteredSummaries = append(filteredSummaries, summary)
			continue
		}
		filtered.SummariesInvalid++
	}
	plan.Summaries = filteredSummaries

	filteredProblems := make([]ImportPlanProblem, 0, len(plan.Problems))
	for _, problem := range plan.Problems {
		problem.NodeTmpID = strings.TrimSpace(problem.NodeTmpID)
		if _, ok := nodeByTmp[problem.NodeTmpID]; !ok {
			return filtered, fmt.Errorf("unknown problems.node_tmp_id: %s", problem.NodeTmpID)
		}
		normalizedContent, ok := normalizeProblemContent(problem.Content)
		if !ok {
			filtered.ProblemsInvalid++
			continue
		}
		problem.Content = normalizedContent
		if strings.TrimSpace(problem.Kind) == "" {
			problem.Kind = "qa"
		}
		if problem.SchemaVer <= 0 {
			problem.SchemaVer = 1
		}
		filteredProblems = append(filteredProblems, problem)
	}
	plan.Problems = filteredProblems

	return filtered, nil
}

func hasValidSummaryContent(raw json.RawMessage) bool {
	var content map[string]any
	if err := json.Unmarshal(raw, &content); err != nil {
		return false
	}
	sc, ok := content["sc"].(string)
	return ok && strings.TrimSpace(sc) != ""
}

func normalizeProblemContent(raw json.RawMessage) (json.RawMessage, bool) {
	var content map[string]any
	if err := json.Unmarshal(raw, &content); err != nil {
		return nil, false
	}

	title, _ := content["title"].(string)
	if strings.TrimSpace(title) == "" {
		return nil, false
	}

	stem, _ := content["stem"].(string)
	bodyMD, _ := content["body_md"].(string)
	body, _ := content["body"].(string)
	if strings.TrimSpace(stem) == "" {
		if strings.TrimSpace(bodyMD) != "" {
			content["stem"] = bodyMD
		} else if strings.TrimSpace(body) != "" {
			content["stem"] = body
		} else {
			return nil, false
		}
	}

	normalized, err := json.Marshal(content)
	if err != nil {
		return nil, false
	}
	return normalized, true
}
