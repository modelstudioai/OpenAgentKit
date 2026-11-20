package org.openagentkit.server.service;

import java.io.IOException;

public interface EventSink {
    void onClose(Runnable close);
    void send(String type, String cursor, Object data) throws IOException;
    void complete();
}
