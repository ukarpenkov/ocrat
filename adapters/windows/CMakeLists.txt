cmake_minimum_required(VERSION 3.24)
project(ocrat-ocr LANGUAGES CXX)

if(NOT WIN32)
  message(FATAL_ERROR "ocrat-ocr for Windows builds on Windows.")
endif()

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

file(GLOB CPPWINRT_CANDIDATES "C:/Program Files (x86)/Windows Kits/10/bin/*/x64/cppwinrt.exe")
if(NOT CPPWINRT_CANDIDATES)
  message(FATAL_ERROR "cppwinrt.exe was not found in the Windows SDK.")
endif()
list(SORT CPPWINRT_CANDIDATES COMPARE NATURAL ORDER DESCENDING)
list(GET CPPWINRT_CANDIDATES 0 CPPWINRT)

set(GEN_DIR "${CMAKE_BINARY_DIR}/generated")
set(GEN_STAMP "${GEN_DIR}/winrt/base.h")
add_custom_command(
  OUTPUT "${GEN_STAMP}"
  COMMAND "${CPPWINRT}" -input sdk -output "${GEN_DIR}"
  VERBATIM
  COMMENT "Generating C++/WinRT headers"
)
add_custom_target(cppwinrt_headers DEPENDS "${GEN_STAMP}")

add_executable(ocrat-ocr src/main.cpp)
add_dependencies(ocrat-ocr cppwinrt_headers)
target_include_directories(ocrat-ocr PRIVATE "${GEN_DIR}")
target_compile_definitions(ocrat-ocr PRIVATE UNICODE _UNICODE NOMINMAX WIN32_LEAN_AND_MEAN)
target_compile_options(ocrat-ocr PRIVATE /EHsc /utf-8 /permissive-)
target_link_options(ocrat-ocr PRIVATE "/SUBSYSTEM:WINDOWS" "/ENTRY:mainCRTStartup")
target_link_libraries(ocrat-ocr PRIVATE windowsapp shcore)
