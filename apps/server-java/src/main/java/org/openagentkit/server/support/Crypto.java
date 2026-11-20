package org.openagentkit.server.support;

import org.bouncycastle.crypto.generators.SCrypt;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

public final class Crypto {
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Pattern PASSWORD = Pattern.compile("scrypt\\$32768\\$8\\$3\\$([a-f0-9]{32})\\$([a-f0-9]{128})");

    private Crypto() {}

    public static String token(int bytes) {
        return base64(random(bytes));
    }

    public static byte[] random(int bytes) {
        byte[] value = new byte[bytes];
        RANDOM.nextBytes(value);
        return value;
    }

    public static String digest(String text) {
        return digest(text.getBytes(StandardCharsets.UTF_8));
    }

    public static String digest(byte[] bytes) {
        try {
            return hex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (GeneralSecurityException error) {
            throw new IllegalStateException(error);
        }
    }

    public static byte[] hmac(String key, String message) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return mac.doFinal(message.getBytes(StandardCharsets.UTF_8));
        } catch (GeneralSecurityException error) {
            throw new IllegalStateException(error);
        }
    }

    public static boolean equals(String left, String right) {
        return MessageDigest.isEqual(left.getBytes(StandardCharsets.UTF_8), right.getBytes(StandardCharsets.UTF_8));
    }

    public static String base64(byte[] bytes) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    public static String base64(String text) {
        return base64(text.getBytes(StandardCharsets.UTF_8));
    }

    public static byte[] unbase64(String text) {
        return Base64.getUrlDecoder().decode(text);
    }

    public static String decode(String text) {
        return new String(unbase64(text), StandardCharsets.UTF_8);
    }

    public static String password(String password) {
        String salt = hex(random(16));
        return "scrypt$32768$8$3$" + salt + "$" + passwordKey(password, salt);
    }

    public static boolean passwordMatches(String password, String hash) {
        Matcher match = PASSWORD.matcher(hash == null ? "" : hash);
        boolean present = match.matches();
        String salt = present ? match.group(1) : "0".repeat(32);
        return equals(passwordKey(password, salt), present ? match.group(2) : "0".repeat(128)) && present;
    }

    private static String passwordKey(String password, String salt) {
        return hex(SCrypt.generate(password.getBytes(StandardCharsets.UTF_8), salt.getBytes(StandardCharsets.US_ASCII),
            32768, 8, 3, 64));
    }

    private static String hex(byte[] bytes) {
        char[] digits = "0123456789abcdef".toCharArray();
        char[] result = new char[bytes.length * 2];
        for (int index = 0; index < bytes.length; index++) {
            int value = bytes[index] & 255;
            result[index * 2] = digits[value >>> 4];
            result[index * 2 + 1] = digits[value & 15];
        }
        return new String(result);
    }
}
