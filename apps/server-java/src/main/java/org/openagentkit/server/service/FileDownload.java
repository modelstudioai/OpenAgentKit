package org.openagentkit.server.service;

public final class FileDownload {
    public final String filename;
    public final String contentType;
    public final byte[] bytes;

    public FileDownload(String filename, String contentType, byte[] bytes) {
        this.filename = filename;
        this.contentType = contentType;
        this.bytes = bytes;
    }
}
