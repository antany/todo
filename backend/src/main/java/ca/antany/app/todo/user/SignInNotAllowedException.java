package ca.antany.app.todo.user;

public class SignInNotAllowedException extends RuntimeException {
    private final String code;

    public SignInNotAllowedException(String code, String message) {
        super(message);
        this.code = code;
    }

    /** Short machine-readable reason, shown to the user as /login?error=&lt;code&gt;. */
    public String getCode() { return code; }
}
