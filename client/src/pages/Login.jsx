import React, { useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import './Auth.css'; // Will create this later

export default function Login() {
    const emailRef = useRef();
    const passwordRef = useRef();
    const { login } = useAuth();
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    async function handleSubmit(e) {
        e.preventDefault();

        try {
            setError('');
            setLoading(true);
            await login(emailRef.current.value, passwordRef.current.value);
            navigate('/');
        } catch (err) {
            console.error(err);
            setError('Failed to log in: ' + err.message);
        }
        setLoading(false);
    }

    return (
        <div className="auth-container">
            <div className="auth-card">
                <div className="auth-header">
                    <h1 style={{ color: 'white', margin: '10px 0 0 0', fontSize: '1.5rem' }}>Finance Control</h1>
                </div>
                <div className="auth-body">
                    <h2 className="auth-title">Log In</h2>
                    {error && <div className="auth-error">{error}</div>}
                    <form onSubmit={handleSubmit} className="auth-form">
                        <div className="form-group">
                            <label>Email</label>
                            <input type="email" ref={emailRef} required />
                        </div>
                        <div className="form-group">
                            <label>Password</label>
                            <input type="password" ref={passwordRef} required />
                        </div>
                        <button disabled={loading} className="auth-button" type="submit">
                            Log In
                        </button>
                    </form>
                    <div className="auth-links">
                        <Link to="/forgot-password">Forgot Password?</Link>
                    </div>
                    <div className="auth-links">
                        Need an account? <Link to="/register">Sign Up</Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
