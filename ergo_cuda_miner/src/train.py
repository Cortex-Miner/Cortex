import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report
import joblib
import json
import math

# Load and clean data
rows = []
with open("logs/nonces.jsonl", "r") as f:
    for line in f:
        try:
            row = json.loads(line)
            row["nonceRange"] = int(row["nonceEnd"]) - int(row["nonceStart"])
            raw_difficulty = float(row["difficulty"])
            row["difficulty_log"] = math.log10(raw_difficulty + 1)  # Safe log
            rows.append(row)
        except Exception as e:
            print(f"Skipping invalid row: {e}")

df = pd.DataFrame(rows)

# Drop bad rows
df.replace([np.inf, -np.inf], np.nan, inplace=True)
df.dropna(inplace=True)
df = df[df["nonceRange"] > 0]
df = df[df["temp"] < 100]
df = df[df["power"] < 1000]
df = df[df["util"] <= 100]

# Show final dataset
print(f"[DEBUG] Training rows after cleanup: {len(df)}")
print(df[["temp", "util", "power", "nonceRange", "difficulty_log"]].describe())

if len(df) == 0:
    print("[ERROR] No data available. Try again later.")
    exit(1)

# Prepare features
features = df[["temp", "util", "power", "nonceRange", "difficulty_log"]].astype(np.float32)
labels = df["accepted"].astype(int)

# Train model
X_train, X_test, y_train, y_test = train_test_split(features, labels, test_size=0.2)
model = RandomForestClassifier(n_estimators=100, max_depth=8)
model.fit(X_train, y_train)

# Save model
joblib.dump(model, "model.joblib")

# Report
print("[TRAINING] Model evaluation:")
print(classification_report(y_test, model.predict(X_test)))
