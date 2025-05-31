# app.py
from flask import Flask
from ergo_node import ergo_bp

app = Flask(__name__)
app.register_blueprint(ergo_bp)
# ... (existing routes)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080, debug=True)
