FROM public.ecr.aws/supabase/postgres@sha256:3866d94d8426927e8db3f1c5d790752292bfbe27b5f1f46e199ae1b7d3c1710b
USER root
RUN printf '%s\n' https://dl-cdn.alpinelinux.org/alpine/v3.23/main > /etc/apk/repositories \
 && apk add --no-cache gdbm=1.26-r0 libbz2=1.0.8-r6 libexpat=2.8.5-r0 libffi=3.5.2-r0 libgcc=15.2.0-r2 libpanelw=6.5_p20251123-r0 libstdc++=15.2.0-r2 mpdecimal=4.0.1-r0 pyc=3.12.15-r0 python3=3.12.15-r0 python3-pyc=3.12.15-r0 python3-pycache-pyc0=3.12.15-r0 sqlite-libs=3.53.4-r0 xz-libs=5.8.4-r0 \
 && mkdir -p /opt/homebrew/opt/postgresql@17 /private/tmp /opt/qaw \
 && ln -s /nix/var/nix/profiles/default/bin /opt/homebrew/opt/postgresql@17/bin \
 && ln -s /nix/var/nix/profiles/default/share /opt/homebrew/opt/postgresql@17/share \
 && ln -s "$(pg_config --pkglibdir)" /opt/homebrew/opt/postgresql@17/lib \
 && chown postgres:postgres /private/tmp \
 && chmod 700 /private/tmp \
 && apk info -v | sort > /opt/qaw/runtime-packages.txt
COPY owned-pg-diagnostic-session.py typed-pg-diagnostic-proxy.py diagnostic-window-deadline.py /opt/qaw/
COPY container-diagnostic/service.py /opt/qaw/service.py
ENV PYTHONDONTWRITEBYTECODE=1
USER postgres
ENTRYPOINT ["python3", "-I", "-u", "/opt/qaw/service.py"]
