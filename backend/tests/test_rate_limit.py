"""
Unit tests for rate limiting functionality
"""
import pytest
from unittest.mock import Mock, patch, MagicMock
from fastapi import Request
from app.rate_limit import check_rate_limit


class TestRateLimit:
    """Test rate limiting functionality"""
    
    def test_rate_limit_disabled(self):
        """Test that rate limiting returns True when disabled"""
        request = Mock(spec=Request)
        request.client = Mock()
        request.client.host = "127.0.0.1"
        
        with patch('app.rate_limit.settings') as mock_settings:
            mock_settings.RATE_LIMIT_ENABLED = False
            result = check_rate_limit(request, "test", 10, 60)
            assert result is True
    
    def test_rate_limit_no_redis(self):
        """Test that rate limiting returns True when Redis is unavailable"""
        request = Mock(spec=Request)
        request.client = Mock()
        request.client.host = "127.0.0.1"
        
        with patch('app.rate_limit.settings') as mock_settings, \
             patch('app.rate_limit.redis_client', None):
            mock_settings.RATE_LIMIT_ENABLED = True
            result = check_rate_limit(request, "test", 10, 60)
            assert result is True
    
    def test_rate_limit_first_request(self):
        """Test that first request is allowed"""
        request = Mock(spec=Request)
        request.client = Mock()
        request.client.host = "127.0.0.1"
        
        mock_redis = MagicMock()
        mock_redis.get.return_value = None
        
        with patch('app.rate_limit.settings') as mock_settings, \
             patch('app.rate_limit.redis_client', mock_redis):
            mock_settings.RATE_LIMIT_ENABLED = True
            result = check_rate_limit(request, "test", 10, 60)
            
            assert result is True
            mock_redis.setex.assert_called_once()
    
    def test_rate_limit_within_limit(self):
        """Test that requests within limit are allowed"""
        request = Mock(spec=Request)
        request.client = Mock()
        request.client.host = "127.0.0.1"
        
        mock_redis = MagicMock()
        mock_redis.get.return_value = "5"  # 5 requests so far
        
        with patch('app.rate_limit.settings') as mock_settings, \
             patch('app.rate_limit.redis_client', mock_redis):
            mock_settings.RATE_LIMIT_ENABLED = True
            result = check_rate_limit(request, "test", 10, 60)
            
            assert result is True
            mock_redis.incr.assert_called_once()
    
    def test_rate_limit_exceeded(self):
        """Test that requests exceeding limit are blocked"""
        request = Mock(spec=Request)
        request.client = Mock()
        request.client.host = "127.0.0.1"
        
        mock_redis = MagicMock()
        mock_redis.get.return_value = "10"  # Already at limit
        
        with patch('app.rate_limit.settings') as mock_settings, \
             patch('app.rate_limit.redis_client', mock_redis):
            mock_settings.RATE_LIMIT_ENABLED = True
            result = check_rate_limit(request, "test", 10, 60)
            
            assert result is False
            mock_redis.incr.assert_not_called()

