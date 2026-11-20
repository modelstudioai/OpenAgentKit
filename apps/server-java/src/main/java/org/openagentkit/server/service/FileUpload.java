package org.openagentkit.server.service;

import java.io.IOException;

public final class FileUpload {
    @FunctionalInterface
    public interface Content {
        byte[] read() throws IOException;
    }

    public final String filename;
    public final String contentType;
    public final long size;
    private final Content content;

    public FileUpload(String filename, String contentType, long size, Content content) {
        this.filename = filename;
        this.contentType = contentType;
        this.size = size;
        this.content = content;
    }

    public byte[] bytes() throws IOException {
        return content.read();
    }
}
