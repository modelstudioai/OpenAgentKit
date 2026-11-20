package org.openagentkit.server.service;

import com.fasterxml.jackson.databind.JsonNode;
import org.openagentkit.server.KitConfig;
import org.openagentkit.server.KitError;
import org.openagentkit.server.KitJson;
import org.springframework.stereotype.Service;
import org.springframework.web.util.HtmlUtils;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.stream.Stream;

@Service
public final class EvaluationService {
    private final List<Path> workspaces;
    private final KitJson json;

    EvaluationService(KitConfig config, KitJson json) {
        this.workspaces = config.list("KIT_EVAL_WORKSPACES").stream().map(path -> Path.of(path).toAbsolutePath().normalize())
            .distinct().collect(Collectors.toList());
        this.json = json;
    }

    public List<Object> workspaces() {
        List<Object> result = new ArrayList<>();
        for (Path workspace : workspaces) {
            if (!Files.isDirectory(workspace)) continue;
            Map<String, Object> view = KitJson.fields("path", workspace.toString(), "name", workspace.getFileName().toString(),
                "runs", runs(workspace).size());
            try {
                String skill = jsonFile(workspace.resolve("evals/evals.json")).path("skill_name").asText(null);
                if (skill != null) view.put("skill_name", skill);
            } catch (RuntimeException ignored) {
                // 旧 workspace 可能只有结果目录。
            }
            result.add(view);
        }
        return result;
    }

    private Path workspace(String requested) {
        return workspaces.stream().filter(path -> path.toString().equals(requested) && Files.isDirectory(path))
            .findFirst().orElseThrow(() -> KitError.missing("评测 workspace 不存在或未配置"));
    }

    private List<Run> runs(Path workspace) {
        Path directory = workspace.resolve("runs");
        if (!Files.isDirectory(directory, LinkOption.NOFOLLOW_LINKS)) return List.of();
        List<Run> result = new ArrayList<>();
        try (Stream<Path> entries = Files.list(directory)) {
            for (Path entry : (Iterable<Path>) entries::iterator) {
                try {
                    result.add(read(workspace, entry.getFileName().toString()));
                } catch (KitError ignored) {
                    // 跳过正在生成的或损坏的 run。
                }
            }
        } catch (IOException failure) {
            throw new KitError("internal", 500, "评测结果目录读取失败");
        }
        result.sort(Comparator.comparing((Run run) -> run.manifest.path("created_at").asText()).reversed());
        return result;
    }

    private Run read(Path workspace, String id) {
        if (id == null || !id.matches("run-[A-Za-z0-9_.-]{1,128}")) throw KitError.missing("评测记录不存在");
        Path runs = workspace.resolve("runs");
        Path path = runs.resolve(id);
        if (!Files.isDirectory(runs, LinkOption.NOFOLLOW_LINKS) || !Files.isDirectory(path, LinkOption.NOFOLLOW_LINKS))
            throw KitError.missing("评测记录不存在");
        JsonNode manifest = jsonFile(path.resolve("manifest.json"));
        String status = manifest.path("status").asText("");
        if (!status.isEmpty() && !status.equals("complete")) throw KitError.missing("评测记录尚未完成");
        JsonNode benchmark = jsonFile(path.resolve("benchmark.json"));
        JsonNode cases = jsonFile(path.resolve("results.json"));
        if (!cases.isArray() || !benchmark.path("run_summary").path("with_skill").isObject())
            throw KitError.missing("评测记录不完整");
        Path baseline = path.resolve("baseline");
        JsonNode baselineCases = Files.isDirectory(baseline, LinkOption.NOFOLLOW_LINKS) &&
            Files.exists(baseline.resolve("results.json"), LinkOption.NOFOLLOW_LINKS) ? jsonFile(baseline.resolve("results.json")) : null;
        return new Run(id, path, manifest, benchmark, cases, baselineCases);
    }

    private JsonNode jsonFile(Path path) {
        try {
            return json.stored(text(path));
        } catch (IllegalStateException error) {
            throw KitError.missing("评测产物无法读取");
        }
    }

    private String text(Path path) {
        try {
            if (!Files.isRegularFile(path, LinkOption.NOFOLLOW_LINKS) || Files.size(path) > 32L * 1024 * 1024)
                throw KitError.missing("评测产物缺失或超过读取上限");
            return Files.readString(path);
        } catch (IOException failure) {
            throw KitError.missing("评测产物无法读取");
        }
    }

    private Map<String, Object> summary(Run run) {
        JsonNode runs = run.benchmark.path("run_summary");
        JsonNode skill = run.manifest.path("skill");
        JsonNode pass = runs.path("with_skill").path("pass_rate");
        return KitJson.fields("run_id", run.id, "created_at", run.manifest.path("created_at").asText(),
            "skill", Map.of("name", skill.path("name").asText(), "version", skill.path("version").asText()),
            "model", run.manifest.path("model").asText(), "judge_model", run.manifest.path("judge_model").asText(),
            "case_count", run.cases.size(), "pass_rate", pass.path("mean").asDouble(), "pass_rate_stddev", pass.path("stddev").asDouble(),
            "baseline_pass_rate", runs.path("without_skill").path("pass_rate").path("mean").numberValue(),
            "delta_pass_rate", runs.path("delta").path("pass_rate").numberValue(),
            "infra_excluded", runs.path("with_skill").path("infra_excluded").asInt());
    }

    private List<Object> cases(JsonNode rows) {
        List<Object> result = new ArrayList<>();
        for (JsonNode row : rows) {
            Map<String, Object> projected = KitJson.fields("case_id", row.path("case_id"), "kind", row.path("kind"),
                "triggered", row.path("triggered").asBoolean(), "turns", row.path("turns").asInt(),
                "duration_ms", row.path("duration_ms").asDouble(), "score", row.path("score"));
            if (row.path("infra_error").asBoolean()) projected.put("infra_error", true);
            if (row.hasNonNull("error")) projected.put("error", row.get("error"));
            List<Object> assertions = new ArrayList<>();
            for (JsonNode assertion : row.path("grading").path("assertion_results")) {
                assertions.add(KitJson.fields("kind", assertion.path("kind").asText(), "passed", assertion.path("passed").asBoolean(),
                    "text", assertion.path("text").asText(), "evidence", assertion.path("evidence").asText()));
            }
            projected.put("assertions", assertions);
            result.add(projected);
        }
        return result;
    }

    private String render(Run run) {
        Path report = run.directory.resolve("report.html");
        if (Files.isRegularFile(report, LinkOption.NOFOLLOW_LINKS)) return text(report);
        String title = escape(run.manifest.path("skill").path("name").asText()) + " 评测报告";
        StringBuilder html = new StringBuilder("<!doctype html><html lang=\"zh\"><meta charset=\"utf-8\"><title>")
            .append(title).append("</title><h1>").append(title).append("</h1><p>")
            .append(escape(run.id)).append(" · 通过率 ").append(summary(run).get("pass_rate")).append("</p>");
        for (JsonNode row : run.cases) {
            html.append("<h2>").append(escape(row.path("case_id").asText())).append("</h2><ul>");
            for (JsonNode assertion : row.path("grading").path("assertion_results")) {
                html.append("<li>").append(assertion.path("passed").asBoolean() ? "通过" : "失败").append(" · ")
                    .append(escape(assertion.path("text").asText())).append(" · ")
                    .append(escape(assertion.path("evidence").asText())).append("</li>");
            }
            html.append("</ul>");
        }
        return html.append("</html>").toString();
    }

    private static String escape(String text) { return HtmlUtils.htmlEscape(text); }

    private static final class Run {
        final String id;
        final Path directory;
        final JsonNode manifest;
        final JsonNode benchmark;
        final JsonNode cases;
        final JsonNode baseline;

        Run(String id, Path directory, JsonNode manifest, JsonNode benchmark, JsonNode cases, JsonNode baseline) {
            this.id = id;
            this.directory = directory;
            this.manifest = manifest;
            this.benchmark = benchmark;
            this.cases = cases;
            this.baseline = baseline;
        }
    }

    public Object list(String name) {
        return KitJson.data(runs(workspace(name)).stream().map(this::summary).collect(Collectors.toList()));
    }

    public Object detail(String name, String runId) {
        Run run = read(workspace(name), runId);
        List<Object> cases = cases(run.cases);
        return KitJson.data(KitJson.fields("summary", summary(run), "cases", cases,
            "baseline_cases", run.baseline == null ? null : cases(run.baseline), "report_html", render(run)));
    }
}
