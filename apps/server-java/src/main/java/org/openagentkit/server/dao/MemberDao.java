package org.openagentkit.server.dao;

import org.openagentkit.server.store.KitDatabase.Row;
import org.openagentkit.server.store.KitDatabase;
import org.springframework.stereotype.Repository;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

@Repository
public class MemberDao {
    private static final String MEMBER_VIEW = "member_id, username, display_name, email, auth_type, status, created_at, updated_at";
    private static final String GROUP_COLUMNS = "g.group_id,g.name,g.description,g.revision,g.created_at,g.updated_at," +
        "(SELECT COUNT(*) FROM kit_group_members gm WHERE gm.group_id=g.group_id) AS member_count";
    private final KitDatabase db;

    MemberDao(KitDatabase db) {
        this.db = db;
    }

    public int insertMember(String memberId, String username, String displayName, String email, String passwordHash, String createdAt, String updatedAt) {
        return db.run("INSERT INTO kit_members (member_id,username,display_name,email,auth_type,status,password_hash,created_at,updated_at) " +
            "VALUES (?,?,?,?,'local','active',?,?,?)",
            memberId, username, displayName, email, passwordHash, createdAt, updatedAt);
    }

    public List<Row> listMemberships(String memberId) {
        return db.all("SELECT g.group_id,g.name FROM kit_groups g JOIN kit_group_members m " +
            "ON m.group_id=g.group_id WHERE m.member_id=? ORDER BY g.name,g.group_id", memberId);
    }

    public Row findGroup(String groupId) {
        return db.one("SELECT " + GROUP_COLUMNS + " FROM kit_groups g WHERE g.group_id=?", groupId);
    }

    public int insertGroup(String groupId, String name, String description, String createdAt, String updatedAt) {
        return db.run("INSERT INTO kit_groups (group_id,name,description,created_at,updated_at) VALUES (?,?,?,?,?)",
            groupId, name, description, createdAt, updatedAt);
    }

    public int updateGroup(String name, String description, String updatedAt, String groupId) {
        return db.run("UPDATE kit_groups SET name=?,description=?,revision=revision+1,updated_at=? WHERE group_id=?",
            name, description, updatedAt, groupId);
    }

    public Row findGroupMembership(String groupId, String memberId) {
        return db.one("SELECT 1 FROM kit_group_members WHERE group_id=? AND member_id=?", groupId, memberId);
    }

    public int insertGroupMembership(String groupId, String memberId) {
        return db.run("INSERT INTO kit_group_members (group_id,member_id) VALUES (?,?)", groupId, memberId);
    }

    public int deleteGroupMembership(String groupId, String memberId) {
        return db.run("DELETE FROM kit_group_members WHERE group_id=? AND member_id=?", groupId, memberId);
    }

    public int advanceGroupRevision(String updatedAt, String groupId) {
        return db.run("UPDATE kit_groups SET revision=revision+1,updated_at=? WHERE group_id=?", updatedAt, groupId);
    }

    public int clearGroupMembers(String groupId) {
        return db.run("DELETE FROM kit_group_members WHERE group_id=?", groupId);
    }

    public int deleteGroup(String groupId) {
        return db.run("DELETE FROM kit_groups WHERE group_id=?", groupId);
    }

    public Row findLoginSession(String tokenHash) {
        return db.one("SELECT member_id,expires_at FROM kit_member_sessions WHERE token_hash=?", tokenHash);
    }

    public Row findMember(String memberId) {
        return db.one("SELECT " + MEMBER_VIEW + " FROM kit_members WHERE member_id=?", memberId);
    }

    public Row findByUsernameWithPassword(String username) {
        return db.one("SELECT " + MEMBER_VIEW + ", password_hash FROM kit_members WHERE username=?", username);
    }

    public int deleteExpiredLoginSessions(String now) {
        return db.run("DELETE FROM kit_member_sessions WHERE expires_at <= ?", now);
    }

    public int insertLoginSession(String tokenHash, String memberId, String createdAt, String expiresAt) {
        return db.run("INSERT INTO kit_member_sessions (token_hash,member_id,created_at,expires_at) VALUES (?,?,?,?)",
            tokenHash, memberId, createdAt, expiresAt);
    }

    public int deleteLoginSession(String tokenHash) {
        return db.run("DELETE FROM kit_member_sessions WHERE token_hash=?", tokenHash);
    }

    public List<Row> searchMembers(String search, String cursorAt, String cursorId, int limit) {
        String pattern = SqlPatterns.contains(search);
        return page("SELECT " + MEMBER_VIEW + " FROM kit_members WHERE " +
            "(LOWER(username) LIKE ? ESCAPE '!' OR LOWER(display_name) LIKE ? ESCAPE '!')",
            new ArrayList<>(List.of(pattern, pattern)), "created_at", "member_id", cursorAt, cursorId, limit);
    }

    public List<Row> searchGroups(String memberId, String membership, String search, String cursorAt, String cursorId, int limit) {
        String match = "EXISTS(SELECT 1 FROM kit_group_members gm WHERE gm.group_id=g.group_id AND gm.member_id=?)";
        List<Object> args = new ArrayList<>();
        if (memberId != null) args.add(memberId);
        String pattern = SqlPatterns.contains(search);
        args.addAll(List.of(pattern, pattern));
        String where = " WHERE (LOWER(g.name) LIKE ? ESCAPE '!' OR LOWER(g.description) LIKE ? ESCAPE '!')";
        if (memberId != null && !membership.equals("all")) {
            args.add(memberId);
            where += " AND " + (membership.equals("excluded") ? "NOT " : "") + match;
        }
        return page("SELECT " + GROUP_COLUMNS + (memberId == null ? "" : "," + match + " AS is_member") +
            " FROM kit_groups g" + where, args, "g.created_at", "g.group_id", cursorAt, cursorId, limit);
    }

    public List<Row> searchGroupMembers(String groupId, String membership, String search, String cursorAt, String cursorId, int limit) {
        String match = "EXISTS(SELECT 1 FROM kit_group_members gm WHERE gm.member_id=m.member_id AND gm.group_id=?)";
        String pattern = SqlPatterns.contains(search);
        List<Object> args = new ArrayList<>(List.of(groupId, pattern, pattern));
        String where = " WHERE (LOWER(m.username) LIKE ? ESCAPE '!' OR LOWER(m.display_name) LIKE ? ESCAPE '!')";
        if (!membership.equals("all")) {
            args.add(groupId);
            where += " AND " + (membership.equals("excluded") ? "NOT " : "") + match;
        }
        String columns = Arrays.stream(MEMBER_VIEW.split(", ")).map(key -> "m." + key).collect(Collectors.joining(","));
        return page("SELECT " + columns + "," + match + " AS is_member FROM kit_members m" + where,
            args, "m.created_at", "m.member_id", cursorAt, cursorId, limit);
    }

    private List<Row> page(String select, List<Object> args, String dateColumn, String idColumn, String cursorAt, String cursorId, int limit) {
        if (cursorAt != null) {
            select += " AND (" + dateColumn + "<? OR (" + dateColumn + "=? AND " + idColumn + "<?))";
            args.addAll(List.of(cursorAt, cursorAt, cursorId));
        }
        args.add(limit);
        return db.all(select + " ORDER BY " + dateColumn + " DESC," + idColumn + " DESC LIMIT ?", args.toArray());
    }
}
