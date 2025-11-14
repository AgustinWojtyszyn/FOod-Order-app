from locust import HttpUser, task, between # type: ignore
import random

class ServiFoodUser(HttpUser):
    """
    Simula un usuario de ServiFood realizando acciones típicas
    OPTIMIZADO: Menos tareas, más enfocado en endpoints críticos
    """
    wait_time = between(0.5, 2)  # Reducido: Espera entre 0.5 y 2 segundos
    
    def on_start(self):
        """Se ejecuta cuando un usuario simulado comienza"""
        # Datos de prueba para registro/login
        self.email = f"test_user_{random.randint(1000, 9999)}@example.com"
        self.password = "Test123456"
        self.auth_token = None
    
    @task(5)
    def view_homepage(self):
        """Visitar la página principal (tarea más común)"""
        self.client.get("/")
    
    @task(3)
    def view_dashboard(self):
        """Visitar el dashboard"""
        self.client.get("/dashboard")
    
    @task(3)
    def view_orders(self):
        """Visitar la página de pedidos"""
        self.client.get("/orders")
    
    @task(2)
    def view_history(self):
        """Visitar el historial"""
        self.client.get("/history")
    
    @task(1)
    def login_attempt(self):
        """Simular intento de login"""
        with self.client.post("/login", json={
            "email": self.email,
            "password": self.password
        }, catch_response=True) as response:
            if response.status_code in [200, 302, 401, 404]:
                response.success()
    
    @task(1)
    def load_static_assets(self):
        """Cargar assets estáticos principales"""
        # Reducido a 1 asset crítico
        self.client.get("/assets/index.js", name="/assets/[static]")


class AdminUser(HttpUser):
    """
    Simula un administrador usando el panel de admin
    """
    wait_time = between(2, 5)
    
    @task(5)
    def view_admin_panel(self):
        """Visitar el panel de administración"""
        self.client.get("/admin")
    
    @task(3)
    def manage_users(self):
        """Gestionar usuarios (simulación)"""
        self.client.get("/admin#users")
    
    @task(2)
    def manage_menu(self):
        """Gestionar menú (simulación)"""
        self.client.get("/admin#menu")
    
    @task(2)
    def manage_options(self):
        """Gestionar opciones (simulación)"""
        self.client.get("/admin#options")


class APIUser(HttpUser):
    """
    Simula llamadas directas a la API/Supabase
    """
    wait_time = between(1, 2)
    
    @task(5)
    def fetch_data(self):
        """Simular peticiones de datos"""
        # Estas son simulaciones genéricas
        # Ajusta según tus endpoints reales
        endpoints = [
            "/api/orders",
            "/api/menu",
            "/api/users",
            "/api/stats"
        ]
        endpoint = random.choice(endpoints)
        self.client.get(endpoint, name="/api/[endpoint]")
