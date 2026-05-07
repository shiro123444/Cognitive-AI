from setuptools import setup, find_packages

setup(
    name="edufish",
    version="0.1.0",
    description="EDUFISH — Lightweight Pluggable AI Engine SDK",
    packages=find_packages(),
    python_requires=">=3.10",
    install_requires=[
        "requests>=2.28",
    ],
    extras_require={
        "dev": [
            "pytest>=7",
            "pytest-cov",
            "responses",
        ],
    },
)
