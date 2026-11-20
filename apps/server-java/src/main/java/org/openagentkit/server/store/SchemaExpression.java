package org.openagentkit.server.store;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

final class SchemaExpression {
    private static final Pattern STRINGS = Pattern.compile("'(?:''|[^'])*'");
    private static final Pattern TOKENS = Pattern.compile("'(?:''|[^'])*'|\"[^\"]*\"|`[^`]*`|!=|<>|>=|<=|[\\w.]+|\\S");
    private static final Pattern CAST = Pattern.compile(
        "::(?:character varying|double precision|text|integer|bigint|smallint|numeric|boolean)(?:\\[\\])?", Pattern.CASE_INSENSITIVE);
    private static final Pattern ANY_ARRAY = Pattern.compile(
        "=\\s*ANY\\s*\\(\\s*(?:\\(ARRAY\\[([^\\]]*)\\]\\)|ARRAY\\[([^\\]]*)\\])\\s*\\)", Pattern.CASE_INSENSITIVE);
    private static final Set<String> COMPARISONS = Set.of("=", "!=", ">", "<", ">=", "<=", "is", "in");

    private SchemaExpression() {}

    // PostgreSQL 展开 IN 并补 cast，两个外部库都会补齐操作数的括号。保留字面量内容及逻辑分组。
    static String normalize(String expression) {
        if (expression == null) return "";
        List<String> literals = new ArrayList<>();
        String template = STRINGS.matcher(expression).replaceAll(match -> {
            literals.add(match.group());
            return "'_kit_literal_'";
        });
        template = CAST.matcher(template).replaceAll("");
        template = ANY_ARRAY.matcher(template).replaceAll(match ->
            Matcher.quoteReplacement(" IN (" + (match.group(1) == null ? match.group(2) : match.group(1)) + ")"));
        template = template.replaceAll("(?i)_(?:utf8mb4|utf8mb3|ascii)(?=')", "");
        List<String> tokens = new ArrayList<>();
        Matcher matcher = TOKENS.matcher(template);
        int index = 0;
        while (matcher.find()) {
            String token = matcher.group();
            if (token.startsWith("'")) tokens.add(literals.get(index++));
            else if (token.equals("<>")) tokens.add("!=");
            else tokens.add(token.replaceAll("^[\"`]|[\"`]$", "").toLowerCase(Locale.ROOT));
        }
        for (int position = tokens.size() - 3; position > 0; position--) {
            if (tokens.get(position).equals("(") && tokens.get(position + 2).equals(")")
                && !Set.of("(", ")").contains(tokens.get(position + 1))
                && (tokens.get(position - 1).equals("(") || COMPARISONS.contains(tokens.get(position - 1))
                    && !Set.of("is", "in").contains(tokens.get(position - 1)))) {
                tokens.remove(position + 2);
                tokens.remove(position);
            }
        }
        return predicate(tokens);
    }

    private static List<String> ungroup(List<String> tokens) {
        while (tokens.size() > 1 && tokens.get(0).equals("(") && tokens.get(tokens.size() - 1).equals(")")) {
            int depth = 1;
            int end = 1;
            for (; end < tokens.size() && depth != 0; end++) depth += levels(tokens.get(end));
            if (end != tokens.size()) break;
            tokens = tokens.subList(1, tokens.size() - 1);
        }
        return tokens;
    }

    private static int levels(String token) {
        if (token.equals("(")) return 1;
        return token.equals(")") ? -1 : 0;
    }

    private static String predicate(List<String> expression) {
        List<String> tokens = ungroup(expression);
        if (tokens.size() > 3 && tokens.subList(0, 2).equals(List.of("case", "when")) && tokens.get(tokens.size() - 1).equals("end")) {
            int then = tokens.indexOf("then");
            if (then > 2) return "case when " + predicate(tokens.subList(2, then)) + " then " + join(tokens.subList(then + 1, tokens.size()));
        }
        for (String operator : List.of("or", "and")) {
            List<List<String>> parts = split(tokens, operator);
            if (parts.size() > 1) return parts.stream().map(SchemaExpression::predicate)
                .collect(Collectors.joining(" " + operator + " ", "(", ")"));
        }
        for (int index = 0; index < tokens.size(); index++) {
            String operator = tokens.get(index);
            if (!COMPARISONS.contains(operator)) continue;
            String right = join(ungroup(tokens.subList(index + 1, tokens.size())));
            return join(ungroup(tokens.subList(0, index))) + " " + operator + " "
                + (operator.equals("in") ? "(" + right + ")" : right);
        }
        return join(tokens);
    }

    private static List<List<String>> split(List<String> tokens, String operator) {
        List<List<String>> parts = new ArrayList<>();
        int depth = 0;
        int start = 0;
        for (int index = 0; index < tokens.size(); index++) {
            String token = tokens.get(index);
            depth += levels(token);
            if (depth == 0 && token.equals(operator)) {
                parts.add(tokens.subList(start, index));
                start = index + 1;
            }
        }
        parts.add(tokens.subList(start, tokens.size()));
        return parts;
    }

    private static String join(List<String> tokens) {
        return String.join(" ", tokens);
    }
}
