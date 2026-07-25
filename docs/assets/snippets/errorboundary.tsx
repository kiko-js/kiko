;<ErrorBoundary fallback={err => <p>出错了: {err.message}</p>}>
  <RiskyComponent />
</ErrorBoundary>
