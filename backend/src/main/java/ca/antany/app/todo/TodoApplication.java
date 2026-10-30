package ca.antany.app.todo;

import java.util.TimeZone;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class TodoApplication {
    public static void main(String[] args) {
        // pgJDBC sends the JVM zone id to Postgres; legacy aliases like Canada/Eastern are rejected.
        TimeZone.setDefault(TimeZone.getTimeZone("UTC"));
        SpringApplication.run(TodoApplication.class, args);
    }
}
