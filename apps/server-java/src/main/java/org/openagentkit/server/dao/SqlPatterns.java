package org.openagentkit.server.dao;

final class SqlPatterns {
    private SqlPatterns() {}

    static String contains(String text) {
        return "%" + text.replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%";
    }
}
