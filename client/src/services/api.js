import axios from 'axios';

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || '/api', // Use relative path for Vite proxy locally, or VITE_API_URL in production
    headers: {
        'Content-Type': 'application/json',
    },
});

export default api;
