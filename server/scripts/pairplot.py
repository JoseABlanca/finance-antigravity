import pandas as pd
import seaborn as sns
import matplotlib.pyplot as plt
import sys
import base64
from io import BytesIO
import json

def generate_pairplot(csv_path):
    try:
        # Load data
        df = pd.read_csv(csv_path)
        
        # Basic cleanup: ensure we only have numeric columns for returns
        df = df.select_dtypes(include=['number'])
        
        # Plot styling
        sns.set_theme(style="whitegrid", palette="viridis")
        
        # Create pairplot
        g = sns.pairplot(df, corner=True, diag_kind="kde", plot_kws={"s": 10, "alpha": 0.6})
        g.fig.suptitle("Correlation Matrix & Returns Distribution (Seaborn)", y=1.02, fontsize=16)
        
        # Save to buffer
        buf = BytesIO()
        plt.savefig(buf, format='png', bbox_inches='tight', dpi=100)
        plt.close()
        
        # Encode to base64
        base64_img = base64.b64encode(buf.getvalue()).decode('utf-8')
        
        return {"image": base64_img}
    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No CSV path provided"}))
        sys.exit(1)
    
    path = sys.argv[1]
    result = generate_pairplot(path)
    print(json.dumps(result))
