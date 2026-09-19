"""Regression coverage for browser preflight requests from the deployed UI."""

from fastapi.testclient import TestClient

from app.main import create_app


def test_vercel_origin_can_preflight_login() -> None:
    app = create_app()
    client = TestClient(app)
    origin = "https://study-mate-one-liard.vercel.app"

    response = client.options(
        "/auth/login",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == origin
    assert response.headers["access-control-allow-credentials"] == "true"
    assert "POST" in response.headers["access-control-allow-methods"]
    assert "authorization" in response.headers["access-control-allow-headers"].lower()
