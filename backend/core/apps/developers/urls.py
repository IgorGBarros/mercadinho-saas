from django.urls import path

from . import views

urlpatterns = [
    path('register/', views.register, name='developer_register'),
    path('login/', views.login, name='developer_login'),
    path('firebase-login/', views.firebase_login, name='developer_firebase_login'),
    path('me/', views.me, name='developer_me'),
    path('dashboard/', views.dashboard, name='developer_dashboard'),
    path('checkout/', views.checkout, name='developer_checkout'),
    path('plans/', views.public_api_plans, name='developer_public_plans'),
]