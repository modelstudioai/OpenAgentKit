package poc;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.SpringBootVersion;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.web.context.WebServerInitializedEvent;
import org.springframework.context.event.EventListener;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;

@SpringBootApplication
public class PocApplication {
    public static void main(String[] args) {
        if (Runtime.version().feature() != 11) throw new IllegalStateException("PoC 需要 JDK 11");
        SpringApplication.run(PocApplication.class, args);
    }

    @EventListener
    public void started(WebServerInitializedEvent event) {
        System.out.println("JAVA_PORT " + event.getWebServer().getPort());
    }
}

@RestController
class PocHealth {
    @GetMapping("/healthz")
    Map<String, Object> health() {
        return Map.of("java_version", System.getProperty("java.version"), "spring_boot", SpringBootVersion.getVersion());
    }
}

@RestControllerAdvice
class PocErrors {
    @ExceptionHandler(PocFailure.class)
    ResponseEntity<Map<String, Object>> failure(PocFailure error) {
        return ResponseEntity.status(error.status).contentType(MediaType.APPLICATION_JSON).body(Map.of("error",
            Map.of("code", error.code, "message", error.getMessage(), "retryable", error.retryable)));
    }
}

final class PocFailure extends RuntimeException {
    final int status;
    final String code;
    final boolean retryable;

    PocFailure(int status, String code, String message) {
        this(status, code, message, false);
    }

    PocFailure(int status, String code, String message, boolean retryable) {
        super(message);
        this.status = status;
        this.code = code;
        this.retryable = retryable;
    }

    static PocFailure notFound() {
        return new PocFailure(404, "not_found", "资源不存在");
    }

    static PocFailure invalid() {
        return new PocFailure(400, "invalid_request", "请求参数不符合 PoC 契约");
    }

    static PocFailure conflict(String message) {
        return new PocFailure(409, "conflict", message);
    }
}
