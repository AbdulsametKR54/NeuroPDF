"""
Unit tests for authentication functionality
"""
import pytest
from app.routers.auth import validate_password_strength, hash_password, verify_password
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class TestPasswordStrength:
    """Test password strength validation"""
    
    def test_password_too_short(self):
        """Test that password must be at least 8 characters"""
        is_valid, error_msg = validate_password_strength("Short1")
        assert not is_valid
        assert "8 karakter" in error_msg
    
    def test_password_no_uppercase(self):
        """Test that password must contain uppercase letter"""
        is_valid, error_msg = validate_password_strength("lowercase123")
        assert not is_valid
        assert "büyük harf" in error_msg
    
    def test_password_no_lowercase(self):
        """Test that password must contain lowercase letter"""
        is_valid, error_msg = validate_password_strength("UPPERCASE123")
        assert not is_valid
        assert "küçük harf" in error_msg
    
    def test_password_no_digit(self):
        """Test that password must contain a digit"""
        is_valid, error_msg = validate_password_strength("NoDigitsHere")
        assert not is_valid
        assert "rakam" in error_msg
    
    def test_valid_password(self):
        """Test that valid password passes"""
        is_valid, error_msg = validate_password_strength("ValidPass123")
        assert is_valid
        assert error_msg == ""


class TestPasswordHashing:
    """Test password hashing and verification"""
    
    def test_hash_password(self):
        """Test that password is hashed correctly"""
        password = "TestPassword123"
        hashed = hash_password(password)
        
        # Bcrypt hashes start with $2b$ or $2a$
        assert hashed.startswith("$2b$") or hashed.startswith("$2a$")
        # Hash should be different from plain password
        assert hashed != password
    
    def test_verify_password_correct(self):
        """Test that correct password is verified"""
        password = "TestPassword123"
        hashed = hash_password(password)
        
        assert verify_password(password, hashed) is True
    
    def test_verify_password_incorrect(self):
        """Test that incorrect password is rejected"""
        password = "TestPassword123"
        wrong_password = "WrongPassword123"
        hashed = hash_password(password)
        
        assert verify_password(wrong_password, hashed) is False
    
    def test_hash_password_uniqueness(self):
        """Test that same password produces different hashes (due to salt)"""
        password = "SamePassword123"
        hash1 = hash_password(password)
        hash2 = hash_password(password)
        
        # Hashes should be different due to salt
        assert hash1 != hash2
        # But both should verify correctly
        assert verify_password(password, hash1) is True
        assert verify_password(password, hash2) is True

