import streamlit as st
import pandas as pd
from datetime import datetime, timedelta
import time
from parser import get_schedule

# Page Config
st.set_page_config(
    page_title="Розклад ФУАІД",
    page_icon="📅",
    layout="wide"
)

# Title
st.title("📅 Розклад занять ФУАІД")
st.markdown("Інструмент для отримання розкладу викладачів.")

# Sidebar for inputs
with st.sidebar:
    st.header("Налаштування пошуку")
    
    # Employee Name Input
    employee_name = st.text_input(
        "ПІБ Викладача",
        value="Абросімов Євгеній Олександрович",
        help="Введіть повне ім'я викладача, як у розкладі."
    )
    
    # Date Range
    col1, col2 = st.columns(2)
    with col1:
        start_date = st.date_input(
            "Початок",
            value=datetime.now(),
            format="DD.MM.YYYY"
        )
    with col2:
        end_date = st.date_input(
            "Кінець",
            value=datetime.now() + timedelta(days=30),
            format="DD.MM.YYYY"
        )
        
    submit_button = st.button("Отримати розклад", type="primary")

# Main Content
if submit_button:
    if not employee_name:
        st.error("Будь ласка, введіть ім'я викладача.")
    else:
        start_str = start_date.strftime("%d.%m.%Y")
        end_str = end_date.strftime("%d.%m.%Y")
        
        with st.spinner(f"Отримання даних для {employee_name} ({start_str} - {end_str})..."):
            try:
                # Call the parser function
                # We might need to handle the browser closing/opening carefully if it's not thread-safe,
                # but playwright sync should be okay if called freshly each time.
                df = get_schedule(employee_name, start_str, end_str)
                
                if df is not None and not df.empty:
                    st.success(f"Знайдено {len(df)} записів!")
                    
                    # Display Data
                    st.dataframe(df, use_container_width=True)
                    
                    # Download Button
                    # Convert DF to Excel in memory
                    import io
                    buffer = io.BytesIO()
                    with pd.ExcelWriter(buffer, engine='openpyxl') as writer:
                        df.to_excel(writer, index=False, sheet_name='Schedule')
                    
                    st.download_button(
                        label="📥 Завантажити Excel",
                        data=buffer.getvalue(),
                        file_name=f"schedule_{start_str}_{end_str}.xlsx",
                        mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    )
                    
                elif df is not None:
                    st.warning("Дані відсутні для вибраного періоду або викладача.")
                else:
                    st.error("Не вдалося отримати розклад. Перевірте ім'я викладача або спробуйте пізніше.")
                    
            except Exception as e:
                st.error(f"Виникла помилка: {str(e)}")

# Footer or Instructions
st.markdown("---")
st.markdown("""
**Інструкція:**
1. Введіть ПІБ викладача (наприклад, *Абросімов Євгеній Олександрович*).
2. Оберіть період дат.
3. Натисніть кнопку **Отримати розклад**.
4. Завантажте результат у форматі Excel.
""")
