import pandas as pd
import json
import os

DATA_FILE = "2017-18 Junior Spelling Study Guide.xlsx"
OUTPUT_FILE = "words.json"

def extract_to_json():
    """Extract Excel file to JSON with 33 words per group"""
    if not os.path.exists(DATA_FILE):
        print(f"Error: {DATA_FILE} not found")
        return
    
    try:
        df = pd.read_excel(DATA_FILE)
        word_col = df.columns[0]
        def_col = df.columns[1] if len(df.columns) > 1 else None
        
        clean_rows = []
        for _, row in df.iterrows():
            if pd.isna(row[word_col]):
                continue
            clean_rows.append({
                "word": str(row[word_col]).strip(),
                "definition": str(row[def_col]).strip() if def_col and not pd.isna(row[def_col]) else "No definition available."
            })
        
        df_clean = pd.DataFrame(clean_rows).sort_values("word").reset_index(drop=True)
        
        # Organize into groups of 33
        words_per_group = 33
        groups = []
        
        for i in range(0, len(df_clean), words_per_group):
            group_num = (i // words_per_group) + 1
            group_words = df_clean.iloc[i:i+words_per_group].to_dict('records')
            groups.append({
                "group": group_num,
                "words": group_words
            })
        
        output = {
            "total_groups": len(groups),
            "total_words": len(df_clean),
            "daily_exam_goal": 33,
            "groups": groups
        }
        
        with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
            json.dump(output, f, indent=2, ensure_ascii=False)
        
        print(f"✓ Extracted {len(df_clean)} words into {len(groups)} groups")
        print(f"✓ Output: {OUTPUT_FILE}")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    extract_to_json()
