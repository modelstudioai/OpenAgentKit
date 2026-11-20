package org.openagentkit.server;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;

@SpringBootApplication(exclude = DataSourceAutoConfiguration.class)
public class KitApplication {
    public static void main(String[] args) {
        SpringApplication.run(KitApplication.class, args);
    }
}
