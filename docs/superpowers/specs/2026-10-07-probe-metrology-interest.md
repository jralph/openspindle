# Future experiment: part detection and metrology

Joseph requested a later exploration of 3D touch-probe uses beyond offsets: detecting part boundaries and experimenting with dimensional inspection. Assess probe support, repeatability and calibration before choosing a design. This is separate from the current simulator XYZ/spindle controller work; no probing implementation or physical motion is authorized by this note.

Joseph has now asked to start this work and confirmed interest in all three areas: rectangular stock detection and width/length, holes/pockets and feature distances, and surface mapping/flatness. He owns Makera's wired 3D touch probe, conductive 3D probe and Z probe. First publish the controller prototype to the jralph fork, then investigate existing support and design the measurement workflow. Physical motion still needs an explicitly chosen and reviewed experiment.
