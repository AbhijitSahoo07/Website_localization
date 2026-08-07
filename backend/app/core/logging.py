import logging

# Configure structured logging format
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s (%(filename)s:%(lineno)d): %(message)s',
    handlers=[
        logging.StreamHandler()
    ]
)

def get_logger(name: str) -> logging.Logger:
    """Returns a logger instance with configured format."""
    return logging.getLogger(name)
