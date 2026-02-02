
import re

def check():
    print("Checking structure (Robust)...")
    with open('index.html', 'r', encoding='utf-8') as f:
        content = f.read()

    # Map char index to line number
    line_starts = [0]
    for i, char in enumerate(content):
        if char == '\n':
            line_starts.append(i + 1)
            
    def get_line(idx):
        import bisect
        # returns 1-based line
        return bisect.bisect_right(line_starts, idx)

    # Regex for tags
    # <div ... > or </div>
    # dotall to match multiline attributes
    tag_re = re.compile(r'(</?div\b[^>]*>)', re.IGNORECASE | re.DOTALL)
    
    stack = []
    
    for match in tag_re.finditer(content):
        tag_text = match.group(1)
        start_idx = match.start()
        line_num = get_line(start_idx)
        
        is_closing = tag_text.lower().startswith('</')
        
        if not is_closing:
            stack.append(line_num)
            if 'lg:col-span-1' in tag_text:
                 print(f"[{line_num}] SIDEBAR OPEN. Depth: {len(stack)}")
            if 'lg:col-span-3' in tag_text:
                 print(f"[{line_num}] MAIN PANEL OPEN. Depth: {len(stack)}")
                 if len(stack) > 2: # Assuming App(1) > Grid(2) > Panel(3). If > 3, we are inside Sidebar?
                     print(f"!!! WARNING: Main Panel depth {len(stack)} implies nesting inside Sidebar !!!")
        else:
            if not stack:
                print(f"[{line_num}] ERROR: Unexpected closing.")
                return
            opener = stack.pop()
            # print(f"[{line_num}] Closed {opener}. Rem: {len(stack)}") 
            
            if line_num >= 250 and line_num <= 256:
                print(f"[{line_num}] Closest to barrier. Closed {opener}. Depth Rem: {len(stack)}")

    print(f"Final Stack: {len(stack)}")

check()
