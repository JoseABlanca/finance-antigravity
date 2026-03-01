import axios from 'axios';

const api = axios.create({
    baseURL: '/api', // Use relative path for Vite proxy
    headers: {
        'Content-Type': 'application/json',
    },
});

export default api;
