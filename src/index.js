// import React from 'react';
// import ReactDOM from 'react-dom/client';
// import './index.css';
// import App from './App';
// import reportWebVitals from './reportWebVitals';

// const root = ReactDOM.createRoot(document.getElementById('root'));
// root.render(
//   <React.StrictMode>
//     <App />
//   </React.StrictMode>
// );

// // If you want to start measuring performance in your app, pass a function
// // to log results (for example: reportWebVitals(console.log))
// // or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
// reportWebVitals();

import ReactDOM from 'react-dom/client'
import {
  BrowserRouter,
  Routes,
  Route,
  Link
} from 'react-router-dom'

const root = ReactDOM.createRoot(document.getElementById('root'))

root.render(
  <BrowserRouter>
    <Routes>
      <Route path='/' element={<Home />} />
      <Route path='/about' element={<About />} />
    </Routes>
  </BrowserRouter>
)

function Home() {
  return (
    <div>
      <h1>当前在 Home 页面</h1>
      <Link to='/about'>About</Link>
    </div>
  )
}

function About() {
  return (
    <div>
      <h1>当前在 About 页面</h1>
      <Link to='/'>Home</Link>
    </div>
  )
}