"""
Unit tests for storage functionality
"""
import pytest
from pathlib import Path
from unittest.mock import Mock, patch
from app.storage import StorageService


class TestStorageService:
    """Test storage service functionality"""
    
    def test_sanitize_filename_path_traversal(self):
        """Test filename sanitization removes path traversal attempts"""
        # Test path traversal
        dangerous = "../../etc/passwd"
        safe = StorageService.sanitize_filename(dangerous)
        assert "../" not in safe
        assert "/" not in safe
        assert "etc" not in safe
        
        # Test backslashes
        dangerous2 = "..\\..\\windows\\system32"
        safe2 = StorageService.sanitize_filename(dangerous2)
        assert "\\" not in safe2
        assert ".." not in safe2
    
    def test_sanitize_filename_dangerous_chars(self):
        """Test filename sanitization removes dangerous characters"""
        # Test dangerous characters
        dangerous = "file<>:\"|?*.pdf"
        safe = StorageService.sanitize_filename(dangerous)
        assert "<" not in safe
        assert ">" not in safe
        assert ":" not in safe
        assert '"' not in safe
        assert "|" not in safe
        assert "?" not in safe
        assert "*" not in safe
        
        # Test normal filename (should pass through mostly unchanged)
        normal = "test_document.pdf"
        safe_normal = StorageService.sanitize_filename(normal)
        assert "test" in safe_normal.lower()
        assert "pdf" in safe_normal.lower()
    
    def test_sanitize_filename_long_names(self):
        """Test that long filenames are truncated"""
        # Test long filenames
        long_name = "a" * 300 + ".pdf"
        safe_long = StorageService.sanitize_filename(long_name)
        assert len(safe_long) <= 205  # 200 chars + extension
    
    def test_sanitize_filename_empty(self):
        """Test that empty filenames get default name"""
        safe = StorageService.sanitize_filename("")
        assert safe == "document"
        
        safe2 = StorageService.sanitize_filename("   ")
        assert safe2 == "document"
    
    def test_generate_file_path(self):
        """Test file path generation"""
        # Test with user_id
        path = StorageService.generate_file_path("user123", "test.pdf")
        assert "user123" in path
        assert "test" in path.lower()
        
        # Test with guest
        guest_path = StorageService.generate_file_path(None, "test.pdf")
        assert "guest" in guest_path
        assert "test" in guest_path.lower()
        
        # Test with dangerous filename
        dangerous_path = StorageService.generate_file_path("user123", "../../etc/passwd")
        assert "../" not in dangerous_path
        assert "/etc" not in dangerous_path

