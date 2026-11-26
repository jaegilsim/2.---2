(() => {
  const loginForm = document.querySelector("#login-form");
  const loginId = document.querySelector("#login-id");
  const loginPassword = document.querySelector("#login-password");
  const loginSubmit = document.querySelector("#login-submit");
  const loginStatus = document.querySelector("#login-status");
  const loginApiEndpoint = "/api/login";
  let isSubmitting = false;

  async function authenticate(username, password) {
    const response = await fetch(loginApiEndpoint, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username, password }),
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(
        response.status === 404
          ? "로그인 API가 아직 서버에 연결되지 않았습니다."
          : result.error || `서버 응답 오류 (${response.status})`,
      );
    }
    if (!result || result.authenticated !== true) {
      throw new Error(result && result.error ? result.error : "아이디 또는 비밀번호를 확인해 주세요.");
    }

    const sessionResponse = await fetch("/api/session", {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
    const session = await sessionResponse.json();
    if (!sessionResponse.ok || !session || session.authenticated !== true) {
      throw new Error(
        session && session.error
          ? session.error
          : "로그인 세션을 확인하지 못했습니다. 다시 시도해 주세요.",
      );
    }
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (isSubmitting || !loginForm.reportValidity()) {
      return;
    }

    isSubmitting = true;
    loginSubmit.disabled = true;
    loginStatus.className = "notice";
    loginStatus.textContent = "서버에 로그인을 요청하고 있습니다.";

    try {
      await authenticate(loginId.value.trim(), loginPassword.value);
      window.location.replace("/quote.html");
    } catch (error) {
      loginStatus.className = "notice error";
      loginStatus.textContent = `로그인 실패: ${error.message}`;
    } finally {
      isSubmitting = false;
      loginSubmit.disabled = false;
    }
  });
})();
