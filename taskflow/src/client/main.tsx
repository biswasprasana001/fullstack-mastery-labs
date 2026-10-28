import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.js";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {/* StrictMode double-invokes render + effects in dev to surface bugs.
        This is why useEffect runs TWICE in development — intentional! */}
    <App />
  </React.StrictMode>
);

