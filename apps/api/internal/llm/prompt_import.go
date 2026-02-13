package llm

import (
	"fmt"
	"strings"

	"github.com/nagasawakenji/studytree-ai/apps/api/internal/usecase"
)

func buildImportPrompt(req usecase.ImportRequest) string {
	var b strings.Builder
	b.WriteString("You are generating import JSON for a study app.\n")
	b.WriteString("Output MUST be valid JSON only. No markdown. No prose.\n")
	b.WriteString("Return exactly one JSON object using this shape:\n")
	b.WriteString("{\"book\":{\"title\":\"...\"},\"nodes\":[{\"tmp_id\":\"ch1\",\"parent_tmp_id\":null,\"title\":\"...\",\"order_index\":0}],\"summaries\":[{\"node_tmp_id\":\"ch1\",\"schema_ver\":1,\"content\":{...}}],\"problems\":[{\"node_tmp_id\":\"ch1\",\"kind\":\"qa\",\"schema_ver\":1,\"content\":{...}}]}\n")
	b.WriteString("Rules:\n")
	b.WriteString("- nodes.tmp_id must be unique and stable.\n")
	b.WriteString("- parent_tmp_id must be null or an existing tmp_id.\n")
	b.WriteString("- Do not create cycles.\n")
	b.WriteString("- Keep order_index 0-based among siblings.\n")
	b.WriteString("- summary content should follow summary.schema.json style and include at least: v, sc.\n")
	b.WriteString("- problem content should follow problem.schema.json style and include at least: title and stem.\n")
	b.WriteString("- Put extra uncertain fields under content.x.\n")
	b.WriteString("- language for text: " + req.Options.Language + "\n")
	b.WriteString(fmt.Sprintf("- target max depth: %d\n", req.Options.MaxDepth))
	b.WriteString(fmt.Sprintf("- target problems per leaf node: %d\n", req.Options.ProblemsPerLeaf))
	b.WriteString("Use this requested book title if suitable: " + req.BookTitle + "\n")
	b.WriteString("Source text:\n")
	b.WriteString(req.SourceText)
	return b.String()
}
