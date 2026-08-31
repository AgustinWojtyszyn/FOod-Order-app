from locust import HttpUser, task, between
class MyUser(HttpUser):
    wait_time = between(1, 3)
    @task
    def home(self): self.client.get("/")
    @task
    def login(self): self.client.post("/login", json={"username":"test","password":"test"})
